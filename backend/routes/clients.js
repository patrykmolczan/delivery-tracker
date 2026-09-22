"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClients = getClients;
exports.getAllClients = getAllClients;
exports.createClient = createClient;
exports.updateClient = updateClient;
exports.deactivateClient = deactivateClient;
exports.importClients = importClients;
exports.getClientRequests = getClientRequests;
exports.submitClientRequest = submitClientRequest;
exports.approveClientRequest = approveClientRequest;
exports.rejectClientRequest = rejectClientRequest;
/**
 * routes/clients.ts — client names + client requests
 */
const db_1 = require("../shared/db");
const auth_1 = require("../shared/auth");
const response_1 = require("../shared/response");
// ── Clients ───────────────────────────────────────────────────────────────────
async function getClients(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.clients WHERE is_active=true ORDER BY name");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getAllClients(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.clients ORDER BY name");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createClient(body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const row = await (0, db_1.queryOne)("INSERT INTO public.clients (name, external_id) VALUES ($1,$2) RETURNING *", [body.name?.trim(), body.external_id?.trim() || null]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateClient(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.clients SET name=$1, external_id=$2 WHERE id=$3", [body.name?.trim(), body.external_id?.trim() || null, id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deactivateClient(id, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.clients SET is_active=false WHERE id=$1", [id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function importClients(body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const rows = body.rows || [];
        const existing = await (0, db_1.query)("SELECT name FROM public.clients");
        const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
        const toInsert = rows
            .filter(r => r.name.trim() && !existingNames.has(r.name.trim().toLowerCase()))
            .map(r => ({ name: r.name.trim(), external_id: r.external_id?.trim() || null }));
        if (toInsert.length === 0)
            return (0, response_1.ok)({ inserted: 0, skipped: rows.length });
        for (const c of toInsert) {
            await (0, db_1.query)("INSERT INTO public.clients (name, external_id) VALUES ($1,$2)", [c.name, c.external_id]);
        }
        return (0, response_1.ok)({ inserted: toInsert.length, skipped: rows.length - toInsert.length });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Client Requests ───────────────────────────────────────────────────────────
async function getClientRequests(_body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const rows = await (0, db_1.query)(`SELECT cr.*, c.name as assigned_client_name
       FROM public.client_requests cr
       LEFT JOIN public.clients c ON c.id = cr.assigned_client_id
       ORDER BY cr.created_at DESC`);
        if (!rows.length)
            return (0, response_1.ok)([]);
        const userIds = [...new Set(rows.map(r => r.requested_by).filter(Boolean))];
        let nameMap = {};
        if (userIds.length) {
            const ph = userIds.map((_, i) => `$${i + 1}`).join(',');
            const profiles = await (0, db_1.query)(`SELECT id, full_name FROM public.profiles WHERE id IN (${ph})`, userIds);
            profiles.forEach(p => { nameMap[p.id] = p.full_name; });
        }
        return (0, response_1.ok)(rows.map(r => ({ ...r, requester_name: nameMap[r.requested_by] || null })));
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function submitClientRequest(body, user) {
    try {
        const name = body.requested_name?.trim();
        if (!name)
            return (0, response_1.err)('requested_name is required', 400);
        const profile = await (0, db_1.queryOne)("SELECT id FROM public.profiles WHERE cognito_id = $1", [user.sub]);
        if (!profile)
            return (0, response_1.err)('User profile not found', 400);
        const row = await (0, db_1.queryOne)("INSERT INTO public.client_requests (requested_name, requested_by) VALUES ($1,$2) RETURNING *", [name, profile.id]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function approveClientRequest(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const req = await (0, db_1.queryOne)("SELECT * FROM public.client_requests WHERE id=$1", [id]);
        if (!req)
            return (0, response_1.notFound)('Request');
        if (body.existing_client_id) {
            const client = await (0, db_1.queryOne)("SELECT * FROM public.clients WHERE id=$1", [body.existing_client_id]);
            if (!client)
                return (0, response_1.notFound)('Client');
            await (0, db_1.query)("UPDATE public.client_requests SET status='reassigned', assigned_client_id=$1 WHERE id=$2", [body.existing_client_id, id]);
            return (0, response_1.ok)(client);
        }
        else {
            const client = await (0, db_1.queryOne)("INSERT INTO public.clients (name) VALUES ($1) RETURNING *", [req.requested_name]);
            await (0, db_1.query)("UPDATE public.client_requests SET status='approved', assigned_client_id=$1 WHERE id=$2", [client.id, id]);
            return (0, response_1.ok)(client);
        }
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function rejectClientRequest(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.client_requests SET status='rejected', notes=$1 WHERE id=$2", [body.notes || null, id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
