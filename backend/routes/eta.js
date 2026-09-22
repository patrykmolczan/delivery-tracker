"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getETA = getETA;
exports.updateETA = updateETA;
exports.getETAHistory = getETAHistory;
/**
 * routes/eta.ts — AI ETA management + history
 */
const db_1 = require("../shared/db");
const auth_1 = require("../shared/auth");
const response_1 = require("../shared/response");
async function getETA(projectId, _user) {
    try {
        const row = await (0, db_1.queryOne)(`SELECT ai_eta_days, ai_eta_confidence, ai_eta_breakdown,
              ai_eta_override_days, ai_eta_override_by, ai_eta_override_at, ai_eta_override_reason
       FROM public.projects WHERE id=$1`, [projectId]);
        if (!row)
            return (0, response_1.notFound)('Project');
        return (0, response_1.ok)(row);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateETA(projectId, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const { new_days, reason, old_days, notify_requester } = body;
        // Resolve profiles.id from cognito_id (FK requirement)
        const prof = await (0, db_1.queryOne)('SELECT id FROM public.profiles WHERE cognito_id=$1', [user.sub]);
        const profileId = prof?.id ?? null;
        await (0, db_1.query)(`UPDATE public.projects SET
        ai_eta_override_days=$1, ai_eta_override_by=$2,
        ai_eta_override_at=NOW(), ai_eta_override_reason=$3
       WHERE id=$4`, [new_days, profileId, reason ?? null, projectId]);
        await (0, db_1.query)(`INSERT INTO public.project_eta_history
        (project_id, changed_by, old_days, new_days, reason, notified_requester)
       VALUES ($1,$2,$3,$4,$5,$6)`, [projectId, profileId, old_days ?? null, new_days, reason ?? null, notify_requester ?? false]);
        // In-app notification for requester
        try {
            const proj = await (0, db_1.queryOne)('SELECT created_by, project_owner FROM public.projects WHERE id=$1', [projectId]);
            if (proj?.created_by && proj.created_by !== profileId) {
                await (0, db_1.query)('INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)', [
                    proj.created_by, 'eta_update', 'Delivery estimate updated',
                    `Your project's ETA has been updated to ${new_days} day${new_days !== 1 ? 's' : ''}${reason ? `: ${reason}` : ''}.`,
                    projectId, proj.project_owner,
                ]);
            }
        }
        catch { /* best effort */ }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getETAHistory(projectId, _user) {
    try {
        const rows = await (0, db_1.query)(`SELECT eh.*, p.full_name as changed_by_name
       FROM public.project_eta_history eh
       LEFT JOIN public.profiles p ON p.id = eh.changed_by
       WHERE eh.project_id=$1
       ORDER BY eh.changed_at DESC LIMIT 20`, [projectId]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
