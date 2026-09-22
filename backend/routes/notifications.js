"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotifications = getNotifications;
exports.getUnreadCount = getUnreadCount;
exports.markRead = markRead;
exports.markAllRead = markAllRead;
exports.deleteNotification = deleteNotification;
exports.createNotification = createNotification;
exports.createNotificationsForAdmins = createNotificationsForAdmins;
exports.getNotificationSettings = getNotificationSettings;
exports.updateNotificationSetting = updateNotificationSetting;
/**
 * routes/notifications.ts — in-app notifications
 *
 * IMPORTANT: notifications.user_id is a FK to profiles.id (NOT cognito_id).
 * All user-scoped queries must resolve profiles.id from user.sub first.
 */
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");

/** Helper: resolve profiles.id from Cognito sub. Returns null if not found. */
async function resolveProfileId(cognitoSub) {
    const row = await (0, db_1.queryOne)(
        'SELECT id FROM profiles WHERE cognito_id = $1 LIMIT 1',
        [cognitoSub]
    );
    return row?.id ?? null;
}

async function getNotifications(body, user) {
    try {
        const profileId = await resolveProfileId(user.sub);
        if (!profileId) return (0, response_1.ok)([]);
        const limit = body?.limit ?? 50;
        const unreadOnly = body?.unread_only ?? false;
        let sql = 'SELECT * FROM public.notifications WHERE user_id=$1';
        const params = [profileId];
        if (unreadOnly) sql += ' AND is_read=false';
        sql += ' ORDER BY created_at DESC LIMIT $2';
        params.push(limit);
        const rows = await (0, db_1.query)(sql, params);
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function getUnreadCount(_body, user) {
    try {
        const profileId = await resolveProfileId(user.sub);
        if (!profileId) return (0, response_1.ok)({ count: 0 });
        const row = await (0, db_1.queryOne)(
            'SELECT COUNT(*) as count FROM public.notifications WHERE user_id=$1 AND is_read=false',
            [profileId]
        );
        return (0, response_1.ok)({ count: parseInt(row?.count ?? '0') });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function markRead(id, user) {
    try {
        const profileId = await resolveProfileId(user.sub);
        if (!profileId) return (0, response_1.ok)({ success: true });
        await (0, db_1.query)(
            'UPDATE public.notifications SET is_read=true WHERE id=$1 AND user_id=$2',
            [id, profileId]
        );
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function markAllRead(_body, user) {
    try {
        const profileId = await resolveProfileId(user.sub);
        if (!profileId) return (0, response_1.ok)({ success: true });
        await (0, db_1.query)(
            'UPDATE public.notifications SET is_read=true WHERE user_id=$1 AND is_read=false',
            [profileId]
        );
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function deleteNotification(id, user) {
    try {
        const profileId = await resolveProfileId(user.sub);
        if (!profileId) return (0, response_1.ok)({ success: true });
        await (0, db_1.query)(
            'DELETE FROM public.notifications WHERE id=$1 AND user_id=$2',
            [id, profileId]
        );
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function createNotification(body, _user) {
    try {
        await (0, db_1.query)(
            'INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)',
            [body.user_id, body.type, body.title, body.body, body.project_id ?? null, body.project_name ?? null]
        );
        return (0, response_1.ok)({ success: true }, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function createNotificationsForAdmins(body, _user) {
    try {
        const admins = await (0, db_1.query)(
            "SELECT id FROM public.profiles WHERE role IN ('admin','super_admin') AND is_active=true"
        );
        // exclude_user_id from frontend is Cognito sub — resolve to profiles.id for correct exclusion
        let excludeProfileId = null;
        if (body.exclude_user_id) {
            const excRow = await (0, db_1.queryOne)(
                'SELECT id FROM profiles WHERE cognito_id = $1 LIMIT 1',
                [body.exclude_user_id]
            );
            excludeProfileId = excRow?.id ?? null;
        }
        const rows = admins
            .filter(a => a.id !== excludeProfileId)
            .map(a => ({
                user_id: a.id, type: body.type, title: body.title,
                body: body.body, project_id: body.project_id ?? null, project_name: body.project_name ?? null,
            }));
        if (rows.length) {
            for (const r of rows) {
                await (0, db_1.query)(
                    'INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name) VALUES ($1,$2,$3,$4,$5,$6)',
                    [r.user_id, r.type, r.title, r.body, r.project_id, r.project_name]
                );
            }
        }
        return (0, response_1.ok)({ notified: rows.length }, 201);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

// ── Notification Settings ─────────────────────────────────────────────────────
async function getNotificationSettings(_body, _user) {
    try {
        const rows = await (0, db_1.query)('SELECT * FROM public.notification_settings ORDER BY label');
        return (0, response_1.ok)(rows);
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}

async function updateNotificationSetting(id, body, _user) {
    try {
        await (0, db_1.query)(
            'UPDATE public.notification_settings SET setting_value=$1 WHERE id=$2',
            [body.enabled, id]
        );
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
