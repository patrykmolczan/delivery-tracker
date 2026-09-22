"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectFeedback = getProjectFeedback;
exports.getUnresolvedCount = getUnresolvedCount;
exports.createFeedback = createFeedback;
exports.resolveItem = resolveItem;
exports.unresolveItem = unresolveItem;
exports.submitUserResponse = submitUserResponse;
exports.submitForReReview = submitForReReview;
/**
 * routes/feedback.ts — project feedback, checklist items, re-review
 */
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
async function notifyUser(userId, type, title, body, projectId, projectName) {
    try {
        await (0, db_1.query)('INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)', [userId, type, title, body, projectId, projectName ?? null]);
    }
    catch { /* best effort */ }
}
async function notifyAdmins(type, title, body, projectId, projectName, excludeId) {
    try {
        const admins = await (0, db_1.query)("SELECT id FROM public.profiles WHERE role IN ('admin','super_admin') AND is_active=true");
        for (const a of admins) {
            if (a.id === excludeId)
                continue;
            await (0, db_1.query)('INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)', [a.id, type, title, body, projectId, projectName ?? null]);
        }
    }
    catch { /* best effort */ }
}
async function getProjectFeedback(projectId, _user) {
    try {
        const [entries, items] = await Promise.all([
            (0, db_1.query)('SELECT * FROM public.project_feedback WHERE project_id=$1 ORDER BY created_at ASC', [projectId]),
            (0, db_1.query)('SELECT * FROM public.project_feedback_items WHERE project_id=$1 ORDER BY created_at ASC', [projectId]),
        ]);
        return (0, response_1.ok)({ entries, items });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getUnresolvedCount(projectId, _user) {
    try {
        const row = await (0, db_1.queryOne)('SELECT COUNT(*) as count FROM public.project_feedback_items WHERE project_id=$1 AND is_resolved=false', [projectId]);
        return (0, response_1.ok)({ count: parseInt(row?.count ?? '0') });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createFeedback(projectId, body, user) {
    try {
        const entry = await (0, db_1.queryOne)(`INSERT INTO public.project_feedback
        (project_id, author_id, author_name, author_role, action_type, message,
         status_change_to_id, status_change_to_name, notify_requester)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
            projectId, user.sub, body.author_name, body.author_role ?? 'admin',
            body.action_type, body.message ?? null,
            body.status_change_to_id ?? null, body.status_change_to_name ?? null,
            body.notify_requester ?? false,
        ]);
        if (body.items?.length) {
            for (const item of body.items) {
                await (0, db_1.query)('INSERT INTO public.project_feedback_items (feedback_id, project_id, item_text, category, priority) VALUES ($1,$2,$3,$4,$5)', [entry.id, projectId, item.item_text, item.category, item.priority]);
            }
        }
        if (body.status_change_to_id) {
            await (0, db_1.query)('UPDATE public.projects SET status_id=$1 WHERE id=$2', [body.status_change_to_id, projectId]);
        }
        // In-app notification for requester
        const proj = await (0, db_1.queryOne)('SELECT created_by, project_owner FROM public.projects WHERE id=$1', [projectId]);
        if (proj?.created_by && proj.created_by !== user.sub) {
            const typeMap = {
                hold: 'feedback_hold', request_changes: 'feedback_changes',
                reject: 'feedback_reject', approve: 'feedback_approve',
            };
            const titleMap = {
                hold: 'Your project has been put on hold',
                request_changes: 'Changes requested on your project',
                reject: 'Your project has been rejected',
                approve: 'Your project has been approved',
            };
            const notifType = typeMap[body.action_type];
            if (notifType) {
                await notifyUser(proj.created_by, notifType, titleMap[body.action_type], body.message || `${body.author_name} took action on your project.`, projectId, proj.project_owner);
            }
        }
        return (0, response_1.ok)(entry, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function resolveItem(itemId, body, user) {
    try {
        await (0, db_1.query)(`UPDATE public.project_feedback_items SET
        is_resolved=true, resolved_by=$1, resolved_by_name=$2,
        resolved_at=NOW(), resolution_note=$3
       WHERE id=$4`, [user.sub, body.resolved_by_name ?? null, body.note ?? null, itemId]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function unresolveItem(itemId, _body, _user) {
    try {
        await (0, db_1.query)(`UPDATE public.project_feedback_items SET
        is_resolved=false, resolved_by=null, resolved_by_name=null,
        resolved_at=null, resolution_note=null
       WHERE id=$1`, [itemId]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function submitUserResponse(projectId, body, user) {
    try {
        const entry = await (0, db_1.queryOne)(`INSERT INTO public.project_feedback
        (project_id, author_id, author_name, author_role, action_type, message,
         status_change_to_id, status_change_to_name, notify_requester)
       VALUES ($1,$2,$3,'user','user_response',$4,null,null,false) RETURNING *`, [projectId, user.sub, body.author_name, body.message]);
        const proj = await (0, db_1.queryOne)('SELECT project_owner, client_name, id_number FROM public.projects WHERE id=$1', [projectId]);
        const label = proj?.client_name || proj?.project_owner || (proj?.id_number ? `#${proj.id_number}` : projectId);
        await notifyAdmins('user_response', 'User replied to feedback', `${body.author_name} responded on "${label}".`, projectId, label, user.sub);
        return (0, response_1.ok)(entry, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function submitForReReview(projectId, body, user) {
    try {
        await (0, db_1.query)(`INSERT INTO public.project_feedback
        (project_id, author_id, author_name, author_role, action_type, message,
         status_change_to_id, status_change_to_name, notify_requester)
       VALUES ($1,$2,$3,'user','resubmit','Project submitted for re-review.',null,null,false)`, [projectId, user.sub, body.author_name]);
        const proj = await (0, db_1.queryOne)('SELECT project_owner, client_name, id_number FROM public.projects WHERE id=$1', [projectId]);
        const label = proj?.client_name || proj?.project_owner || (proj?.id_number ? `#${proj.id_number}` : projectId);
        await notifyAdmins('resubmit', 'Project submitted for re-review', `${body.author_name} submitted "${label}" for re-review.`, projectId, label, user.sub);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
