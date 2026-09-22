"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalysts = getAnalysts;
exports.getAllAnalysts = getAllAnalysts;
exports.createAnalyst = createAnalyst;
exports.updateAnalyst = updateAnalyst;
exports.deactivateAnalyst = deactivateAnalyst;
exports.reactivateAnalyst = reactivateAnalyst;
exports.getClientTypes = getClientTypes;
exports.createClientType = createClientType;
exports.updateClientType = updateClientType;
exports.deactivateClientType = deactivateClientType;
exports.getProjectTypes = getProjectTypes;
exports.createProjectType = createProjectType;
exports.updateProjectType = updateProjectType;
exports.deactivateProjectType = deactivateProjectType;
/**
 * routes/analysts.ts — CRUD for analysts table
 */
const db_1 = require("../shared/db");
const auth_1 = require("../shared/auth");
const response_1 = require("../shared/response");
async function getAnalysts(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.analysts WHERE is_active=true ORDER BY name");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getAllAnalysts(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.analysts ORDER BY name");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createAnalyst(body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const row = await (0, db_1.queryOne)("INSERT INTO public.analysts (name) VALUES ($1) RETURNING *", [body.name?.trim()]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateAnalyst(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.analysts SET name=$1 WHERE id=$2", [body.name?.trim(), id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deactivateAnalyst(id, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.analysts SET is_active=false WHERE id=$1", [id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function reactivateAnalyst(id, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.analysts SET is_active=true WHERE id=$1", [id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Client Types ──────────────────────────────────────────────────────────────
async function getClientTypes(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.client_types WHERE is_active=true ORDER BY name");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createClientType(body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const row = await (0, db_1.queryOne)("INSERT INTO public.client_types (name) VALUES ($1) RETURNING *", [body.name?.trim()]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateClientType(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.client_types SET name=$1 WHERE id=$2", [body.name?.trim(), id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deactivateClientType(id, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.client_types SET is_active=false WHERE id=$1", [id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Project Types ─────────────────────────────────────────────────────────────
async function getProjectTypes(_body, _user) {
    try {
        const rows = await (0, db_1.query)("SELECT * FROM public.project_types WHERE is_active=true ORDER BY display_order");
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createProjectType(body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const row = await (0, db_1.queryOne)("INSERT INTO public.project_types (name, template_url, template_label) VALUES ($1,$2,$3) RETURNING *", [body.name?.trim(), body.template_url || null, body.template_label || null]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateProjectType(id, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const parts = ['name=$1'];
        const params = [body.name?.trim()];
        if (body.template_url !== undefined) {
            params.push(body.template_url);
            parts.push(`template_url=$${params.length}`);
        }
        if (body.template_label !== undefined) {
            params.push(body.template_label);
            parts.push(`template_label=$${params.length}`);
        }
        params.push(id);
        await (0, db_1.query)(`UPDATE public.project_types SET ${parts.join(',')} WHERE id=$${params.length}`, params);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deactivateProjectType(id, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)("UPDATE public.project_types SET is_active=false WHERE id=$1", [id]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
