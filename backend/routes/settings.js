"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppSettings = getAppSettings;
exports.updateAppSetting = updateAppSetting;
exports.getTextPresets = getTextPresets;
exports.createTextPreset = createTextPreset;
exports.updateTextPreset = updateTextPreset;
exports.deleteTextPreset = deleteTextPreset;
exports.getProfile = getProfile;
exports.getProfiles = getProfiles;
exports.getOwnerEmail = getOwnerEmail;
/**
 * routes/settings.ts — app settings + text presets + profiles
 */
const db_1 = require("../shared/db");
const auth_1 = require("../shared/auth");
const response_1 = require("../shared/response");
// ── App Settings ──────────────────────────────────────────────────────────────
// ── Public settings keys (returned without auth) ─────────────────────────────
const PUBLIC_SETTINGS_KEYS = new Set(['logo_url', 'sso_enabled', 'company_name', 'primary_color', 'theme', 'app_name']);
async function getAppSettings(_body, _user) {
    try {
        const rows = await (0, db_1.query)('SELECT key, value FROM public.app_settings');
        const result = {};
        const isAdminUser = (0, auth_1.isAdmin)(_user);
        for (const r of rows) {
            if (r.value != null && (isAdminUser || PUBLIC_SETTINGS_KEYS.has(r.key)))
                result[r.key] = r.value;
        }
        return (0, response_1.ok)(result);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateAppSetting(key, body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        await (0, db_1.query)('UPDATE public.app_settings SET value=$1, updated_at=NOW() WHERE key=$2', [body.value, key]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Text Presets ──────────────────────────────────────────────────────────────
async function getTextPresets(_body, user) {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM public.text_presets WHERE user_id=$1 ORDER BY sort_order ASC', [user.sub]);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function createTextPreset(body, user) {
    try {
        const row = await (0, db_1.queryOne)('INSERT INTO public.text_presets (user_id, name, content, sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [user.sub, body.name, body.content, body.sort_order ?? 0]);
        return (0, response_1.ok)(row, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function updateTextPreset(id, body, user) {
    try {
        const parts = [];
        const params = [];
        if (body.name !== undefined) {
            params.push(body.name);
            parts.push(`name=$${params.length}`);
        }
        if (body.content !== undefined) {
            params.push(body.content);
            parts.push(`content=$${params.length}`);
        }
        if (body.sort_order !== undefined) {
            params.push(body.sort_order);
            parts.push(`sort_order=$${params.length}`);
        }
        if (!parts.length)
            return (0, response_1.ok)({ success: true });
        params.push(id);
        params.push(user.sub);
        await (0, db_1.query)(`UPDATE public.text_presets SET ${parts.join(',')} WHERE id=$${params.length - 1} AND user_id=$${params.length}`, params);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function deleteTextPreset(id, _body, user) {
    try {
        await (0, db_1.query)('DELETE FROM public.text_presets WHERE id=$1 AND user_id=$2', [id, user.sub]);
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
// ── Profiles ──────────────────────────────────────────────────────────────────
async function getProfile(_body, user) {
    try {
        const row = await (0, db_1.queryOne)('SELECT id, email, full_name, role, avatar_url, password_change_required FROM public.profiles WHERE cognito_id=$1 LIMIT 1', [user.sub]);
        if (!row)
            return (0, response_1.ok)(null, 404);
        return (0, response_1.ok)(row);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getProfiles(_body, user) {
    if (!(0, auth_1.isAdmin)(user))
        return (0, response_1.forbidden)();
    try {
        const rows = await (0, db_1.query)('SELECT id, email, full_name, role, is_active, created_at FROM public.profiles ORDER BY full_name');
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
async function getOwnerEmail(userId, _user) {
    try {
        const row = await (0, db_1.queryOne)('SELECT email FROM public.profiles WHERE id=$1', [userId]);
        return (0, response_1.ok)({ email: row?.email ?? null });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
