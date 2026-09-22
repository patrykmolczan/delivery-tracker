"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjects = getProjects;
exports.getProject = getProject;
exports.createProject = createProject;
exports.updateProject = updateProject;
exports.updateProjectStatus = updateProjectStatus;
exports.bulkUpdateStatus = bulkUpdateStatus;
exports.deleteProject = deleteProject;
exports.getProjectCountries = getProjectCountries;
exports.getAllProjectCountries = getAllProjectCountries;
exports.syncProjectCountries = syncProjectCountries;
exports.getProjectTasks = getProjectTasks;
exports.syncProjectTasksRoute = syncProjectTasksRoute;
exports.getProjectHistory = getProjectHistory;
exports.importProjects = importProjects;
exports.updateProjectNotificationsEnabled = updateProjectNotificationsEnabled;
/**
 * routes/projects.ts — CRUD for projects table
 * Aurora replaces PostgREST — no 1000-row limit; direct pg queries.
 */
const db_1 = require("../shared/db");
const auth_1 = require("../shared/auth");
const response_1 = require("../shared/response");
const PROJECT_SELECT = `
  SELECT
    id, project_owner, analyst, client_name, requestor,
    date_received, expected_delivery_date, date_delivered,
    project_summary, job_count, days_to_complete,
    status_id, client_type_id, country_id, industry_id,
    project_type, id_number, time_allocation,
    notifications_enabled, created_by, created_at,
    ai_eta_days, ai_eta_confidence, ai_eta_breakdown,
    ai_eta_override_days, ai_eta_override_by, ai_eta_override_at,
    ai_eta_override_reason,
    record_type, is_imported, assignment_acknowledged,
    countries_text, industry_text, external_id
  FROM public.projects
`;
function sanitize(v) {
    if (v == null || v === '')
        return null;
    return String(v).replace(/<[^>]*>/g, '').trim() || null;
}
/** GET /api/projects — paginated fetch (avoids 6MB Lambda limit)
 *  Query params: limit (default 2000), offset (default 0), count_only (boolean)
 */
async function getProjects(queryParams, _user) {
    try {
        const limit = parseInt(queryParams?.limit ?? '2000', 10);
        const offset = parseInt(queryParams?.offset ?? '0', 10);
        // count_only=true → return just the total row count (for parallel fetch planning)
        if (queryParams?.count_only === 'true') {
            const rows = await (0, db_1.query)('SELECT COUNT(*)::text as count FROM public.projects');
            return (0, response_1.ok)({ count: parseInt(rows[0].count, 10) });
        }
        const rows = await (0, db_1.query)(`${PROJECT_SELECT} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** GET /api/projects/:id — single project */
async function getProject(projectId, _user) {
    try {
        const row = await (0, db_1.queryOne)(`${PROJECT_SELECT} WHERE id = $1`, [projectId]);
        if (!row)
            return (0, response_1.notFound)('Project');
        return (0, response_1.ok)(row);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** POST /api/projects — create project */
async function createProject(body, user) {
    try {
        const form = body;
        // Resolve profile.id from cognito_id so the FK constraint is satisfied
        const profileRow = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id = $1', [user.sub]);
        const profileId = profileRow?.id ?? null;
        const row = await (0, db_1.queryOne)(`INSERT INTO public.projects (
        project_owner, analyst, client_type_id, client_name, requestor,
        date_received, expected_delivery_date, date_delivered,
        project_summary, job_count, status_id, country_id, industry_id,
        project_type, time_allocation, created_by,
        ai_eta_days, ai_eta_confidence, ai_eta_breakdown
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      ) RETURNING *`, [
            sanitize(form.project_owner) ?? form.project_owner,
            sanitize(form.analyst),
            form.client_type_id,
            sanitize(form.client_name) ?? form.client_name,
            sanitize(form.requestor),
            form.date_received,
            form.expected_delivery_date || null,
            form.date_delivered || null,
            sanitize(form.project_summary),
            form.job_count ? parseInt(form.job_count) : null,
            form.status_id,
            form.project_countries?.length > 0 ? form.project_countries[0].country_id : (form.country_id ?? null),
            form.industry_id,
            form.project_type || null,
            form.time_allocation != null && form.time_allocation !== '' ? parseFloat(form.time_allocation) : null,
            profileId,
            form.ai_eta_days ?? null,
            form.ai_eta_confidence ?? null,
            form.ai_eta_breakdown ?? null,
        ]);
        if (!row)
            throw new Error('Insert returned no row');
        // Sync countries & tasks
        if (form.project_countries?.length > 0) {
            await syncCountries(row.id, form.project_countries);
        }
        if (form.project_tasks?.length > 0) {
            await syncTasks(row.id, form.project_tasks, profileId);
        }
        // Notify all admins/super_admins of new project (non-blocking)
        notifyAdminsNewProject(row.id, form.requestor, form.client_name, profileId).catch(() => {});
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** PATCH /api/projects/:id — update project */
async function updateProject(projectId, body, user) {
    try {
        const form = body;
        // Capture before state for notifications
        const current = await (0, db_1.queryOne)('SELECT project_owner, analyst, created_by, notifications_enabled, client_name, status_id FROM public.projects WHERE id = $1', [projectId]);
        await (0, db_1.query)(`UPDATE public.projects SET
        project_owner=$1, analyst=$2, client_type_id=$3, client_name=$4,
        requestor=$5, date_received=$6, expected_delivery_date=$7,
        date_delivered=$8, project_summary=$9, job_count=$10,
        status_id=$11, country_id=$12, industry_id=$13, project_type=$14,
        time_allocation=$15, updated_at=NOW()
       WHERE id=$16`, [
            sanitize(form.project_owner) ?? form.project_owner,
            sanitize(form.analyst),
            form.client_type_id,
            sanitize(form.client_name) ?? form.client_name,
            sanitize(form.requestor),
            form.date_received,
            form.expected_delivery_date || null,
            form.date_delivered || null,
            sanitize(form.project_summary),
            form.job_count ? parseInt(form.job_count) : null,
            form.status_id,
            form.project_countries?.length > 0 ? form.project_countries[0].country_id : (form.country_id ?? null),
            form.industry_id,
            form.project_type || null,
            form.time_allocation != null && form.time_allocation !== '' ? parseFloat(form.time_allocation) : null,
            projectId,
        ]);
        await syncCountries(projectId, form.project_countries || []);
        await syncTasks(projectId, form.project_tasks || []);
        // Assignment notifications (non-blocking)
        if (current && current.notifications_enabled !== false && current.created_by) {
            const newOwner = (sanitize(form.project_owner) ?? form.project_owner)?.trim() || null;
            const newAnalyst = sanitize(form.analyst)?.trim() || null;
            if (newOwner && newOwner !== (current.project_owner?.trim() || null)) {
                await createNotification(current.created_by, 'assignment_changed', 'Project Owner Assigned', `${newOwner} has been assigned as Project Owner on your project.`, projectId, current.client_name);
                // Also notify the newly assigned owner directly
                const ownerProfile = await (0, db_1.queryOne)(`SELECT id FROM public.profiles WHERE full_name ILIKE $1 AND is_active=true LIMIT 1`, [newOwner]).catch(() => null);
                if (ownerProfile?.id && ownerProfile.id !== current.created_by) {
                    await createNotification(ownerProfile.id, 'assignment_changed', "You've Been Assigned as Project Owner", `You are now the Project Owner for "${current.client_name || 'a project'}". Please review the project details.`, projectId, current.client_name);
                }
            }
            const oldAnalyst = current.analyst?.trim() || null;
            if (newAnalyst !== oldAnalyst && newAnalyst) {
                await createNotification(current.created_by, 'assignment_changed', 'Analyst Assigned', `${newAnalyst} has been assigned as Analyst on your project.`, projectId, current.client_name);
                // Also notify the newly assigned analyst directly
                const analystProfile = await (0, db_1.queryOne)(`SELECT id FROM public.profiles WHERE full_name ILIKE $1 AND is_active=true LIMIT 1`, [newAnalyst]).catch(() => null);
                if (analystProfile?.id && analystProfile.id !== current.created_by) {
                    await createNotification(analystProfile.id, 'assignment_changed', "You've Been Assigned as Analyst", `You are now the Analyst for "${current.client_name || 'a project'}". Please review the project details.`, projectId, current.client_name);
                }
            }
        }
        // Audit log — record changed fields (non-blocking)
        if (current) {
            const profileRow = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id = $1', [user.sub]).catch(() => null);
            const profileId = profileRow?.id ?? null;
            // Status change
            const newStatusId = form.status_id != null ? String(form.status_id) : null;
            const oldStatusId = current.status_id != null ? String(current.status_id) : null;
            if (newStatusId !== oldStatusId) {
                const [oldSt, newSt] = await Promise.all([
                    (0, db_1.queryOne)('SELECT name FROM public.project_statuses WHERE id=$1', [current.status_id]).catch(() => null),
                    (0, db_1.queryOne)('SELECT name FROM public.project_statuses WHERE id=$1', [form.status_id]).catch(() => null),
                ]);
                await logAudit(projectId, profileId, 'status_changed', 'status', oldSt?.name ?? oldStatusId, newSt?.name ?? newStatusId);
            }
            // Owner change
            const newOwnerAudit = (sanitize(form.project_owner) ?? form.project_owner)?.trim() || null;
            const oldOwnerAudit = current.project_owner?.trim() || null;
            if (newOwnerAudit !== oldOwnerAudit) {
                await logAudit(projectId, profileId, 'field_updated', 'project_owner', oldOwnerAudit, newOwnerAudit);
            }
            // Analyst change
            const newAnalystAudit = sanitize(form.analyst)?.trim() || null;
            const oldAnalystAudit = current.analyst?.trim() || null;
            if (newAnalystAudit !== oldAnalystAudit) {
                await logAudit(projectId, profileId, 'field_updated', 'analyst', oldAnalystAudit, newAnalystAudit);
            }
        }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** PATCH /api/projects/:id/status — update status */
async function updateProjectStatus(projectId, body, user) {
    try {
        const { status_id, date_received, mark_delivered } = body;
        const today = new Date().toISOString().slice(0, 10);
        const dateDelivered = mark_delivered ? today : null;
        let daysToComplete = null;
        if (mark_delivered && date_received) {
            const start = new Date(date_received + 'T00:00:00');
            const end = new Date(today + 'T00:00:00');
            daysToComplete = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
        }
        const updateParts = ['status_id=$1', 'updated_at=NOW()'];
        const params = [status_id];
        if (mark_delivered) {
            updateParts.push(`date_delivered=$${params.length + 1}`);
            params.push(dateDelivered);
            // days_to_complete is a DB-generated column (computed automatically) —
            // it must not be written to directly, or Postgres rejects the UPDATE (428C9).
        }
        params.push(projectId);
        const prevRow = await (0, db_1.queryOne)('SELECT status_id FROM public.projects WHERE id=$1', [projectId]).catch(() => null);
        await (0, db_1.query)(`UPDATE public.projects SET ${updateParts.join(',')} WHERE id=$${params.length}`, params);
        // Audit log — status change
        try {
            const profileRow = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id = $1', [user?.sub]).catch(() => null);
            const profileId = profileRow?.id ?? null;
            const [oldSt, newSt] = await Promise.all([
                (0, db_1.queryOne)('SELECT name FROM public.project_statuses WHERE id=$1', [prevRow?.status_id]).catch(() => null),
                (0, db_1.queryOne)('SELECT name FROM public.project_statuses WHERE id=$1', [status_id]).catch(() => null),
            ]);
            await logAudit(projectId, profileId, 'status_changed', 'status', oldSt?.name ?? String(prevRow?.status_id ?? ''), newSt?.name ?? String(status_id));
        } catch (auditErr) {
            console.error('audit error:', auditErr.message);
        }
        return (0, response_1.ok)({ date_delivered: dateDelivered, days_to_complete: daysToComplete });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** POST /api/projects/status/bulk — bulk status update */
async function bulkUpdateStatus(body, _user) {
    try {
        const { ids, status_id } = body;
        if (!ids?.length)
            return (0, response_1.ok)({ updated: 0 });
        const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
        await (0, db_1.query)(`UPDATE public.projects SET status_id=$1, updated_at=NOW() WHERE id IN (${placeholders})`, [status_id, ...ids]);
        return (0, response_1.ok)({ updated: ids.length });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
/** DELETE /api/projects/:id — admin only */
async function deleteProject(projectId, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        // Fetch file paths for storage cleanup (best effort)
        const pFiles = await (0, db_1.query)('SELECT storage_path FROM public.project_files WHERE project_id=$1', [projectId]);
        const dFiles = await (0, db_1.query)('SELECT storage_path FROM public.project_delivery_files WHERE project_id=$1', [projectId]);
        await (0, db_1.query)('DELETE FROM public.projects WHERE id=$1', [projectId]);
        return (0, response_1.ok)({
            success: true,
            storagePaths: {
                projectFiles: pFiles.map(f => f.storage_path),
                deliveryFiles: dFiles.map(f => f.storage_path),
            },
        });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Project Countries ─────────────────────────────────────────────────────────
async function getProjectCountries(projectId, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT pc.*, c.name as country_name
       FROM public.project_countries pc
       LEFT JOIN public.countries c ON c.id = pc.country_id
       WHERE pc.project_id=$1 ORDER BY pc.sort_order`, [projectId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getAllProjectCountries(_body, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT pc.project_id, c.name as country_name
       FROM public.project_countries pc
       LEFT JOIN public.countries c ON c.id = pc.country_id
       ORDER BY pc.sort_order`);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function syncProjectCountries(projectId, body, _user) {
    try {
        await syncCountries(projectId, body.entries || []);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function syncCountries(projectId, entries) {
    await (0, db_1.query)('DELETE FROM public.project_countries WHERE project_id=$1', [projectId]);
    if (!entries.length)
        return;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        await (0, db_1.query)('INSERT INTO public.project_countries (project_id, country_id, job_count, sort_order) VALUES ($1,$2,$3,$4)', [projectId, e.country_id, e.job_count ? parseInt(e.job_count) : null, i]);
    }
}
// ── Project Tasks ─────────────────────────────────────────────────────────────
async function getProjectTasks(projectId, _user) {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM public.project_tasks WHERE project_id=$1 ORDER BY sort_order', [projectId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function syncProjectTasksRoute(projectId, body, user) {
    try {
        const taskProfileRow = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id = $1', [user.sub]);
        const taskProfileId = taskProfileRow?.id ?? null;
        await syncTasks(projectId, body.tasks || [], taskProfileId);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function syncTasks(projectId, tasks, userId) {
    const existing = await (0, db_1.query)('SELECT id FROM public.project_tasks WHERE project_id=$1', [projectId]);
    const existingIds = new Set(existing.map(r => r.id));
    const incomingIds = new Set(tasks.filter(t => t.id).map(t => t.id));
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id));
    if (toDelete.length) {
        const ph = toDelete.map((_, i) => `$${i + 1}`).join(',');
        await (0, db_1.query)(`DELETE FROM public.project_tasks WHERE id IN (${ph})`, toDelete);
    }
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (t.id && existingIds.has(t.id)) {
            await (0, db_1.query)('UPDATE public.project_tasks SET title=$1, description=$2, sort_order=$3, updated_at=NOW() WHERE id=$4', [t.title, t.description, i, t.id]);
        }
        else {
            await (0, db_1.query)('INSERT INTO public.project_tasks (project_id, title, description, sort_order, created_by) VALUES ($1,$2,$3,$4,$5)', [projectId, t.title, t.description || null, i, userId || null]);
        }
    }
}
// ── Audit Log Helper ──────────────────────────────────────────────────────────
async function logAudit(projectId, profileId, action, fieldChanged, oldValue, newValue) {
    try {
        await (0, db_1.query)(
            `INSERT INTO public.audit_log (project_id, user_id, action, field_changed, old_value, new_value, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [projectId, profileId || null, action, fieldChanged || null, oldValue || null, newValue || null]
        );
    } catch (e) {
        // non-blocking — never fail the main operation
        console.error('logAudit error:', e.message);
    }
}
// ── Audit Log ─────────────────────────────────────────────────────────────────
async function getProjectHistory(projectId, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT al.*, p.full_name as user_name
       FROM public.audit_log al
       LEFT JOIN public.profiles p ON p.id = al.user_id
       WHERE al.project_id=$1
       ORDER BY al.created_at DESC LIMIT 50`, [projectId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Batch CSV import ───────────────────────────────────────────────────────────
async function importProjects(body, user) {
    try {
        const rows = body.rows || [];
        const BATCH = 50;
        let success = 0;
        const errors = [];
        for (let i = 0; i < rows.length; i += BATCH) {
            const batch = rows.slice(i, i + BATCH);
            try {
                // Resolve profile.id for bulk import FK constraint
                const bulkProfileRow = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id = $1', [user.sub]);
                const bulkProfileId = bulkProfileRow?.id ?? null;
                for (const form of batch) {
                    await (0, db_1.query)(`INSERT INTO public.projects (project_owner, analyst, client_type_id, client_name, requestor,
              date_received, expected_delivery_date, date_delivered, project_summary, job_count,
              status_id, country_id, industry_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
                        form.project_owner, form.analyst || null, form.client_type_id, form.client_name,
                        form.requestor || null, form.date_received, form.expected_delivery_date || null,
                        form.date_delivered || null, form.project_summary || null,
                        form.job_count ? parseInt(form.job_count) : null,
                        form.status_id, form.country_id, form.industry_id, bulkProfileId,
                    ]);
                    success++;
                }
            }
            catch (e) {
                errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${e.message}`);
            }
        }
        return (0, response_1.ok)({ success, errors });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Notification Settings ─────────────────────────────────────────────────────
async function updateProjectNotificationsEnabled(projectId, body, _user) {
    try {
        await (0, db_1.query)('UPDATE public.projects SET notifications_enabled=$1 WHERE id=$2', [body.enabled, projectId]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// Helper: create in-app notification
async function createNotification(userId, type, title, body, projectId, projectName) {
    try {
        await (0, db_1.query)('INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)', [userId, type, title, body, projectId ?? null, projectName ?? null]);
    }
    catch { /* best effort */ }
}
// Helper: notify all admins/super_admins of a new project submission
async function notifyAdminsNewProject(projectId, requestor, clientName, excludeProfileId) {
    try {
        const admins = await (0, db_1.query)(`SELECT id FROM public.profiles WHERE role IN ('admin','super_admin') AND is_active=true`);
        for (const admin of admins) {
            if (admin.id !== excludeProfileId) {
                await (0, db_1.query)(
                    'INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)',
                    [admin.id, 'project_created', 'New Project Submitted',
                     `${requestor || 'A user'} submitted a new project${clientName ? ` for ${clientName}` : ''}.`,
                     projectId, clientName || null]
                );
            }
        }
    }
    catch { /* non-blocking */ }
}
