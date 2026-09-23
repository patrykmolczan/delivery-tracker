"use strict";
/**
 * routes/chat.ts — Project chat messages
 * GET  /api/chat/:projectId          → fetch messages
 * POST /api/chat/:projectId          → send message
 * POST /api/chat/:projectId/read     → mark messages read
 *
 * Aurora schema: project_messages(id, project_id, sender_id, sender_name, sender_role, message, read_by, created_at)
 *
 * Notification behavior (added — fixes regression where PR #83 removed
 * client-side notification calls but the promised server-side replacement
 * was never actually implemented/deployed, so notifications stopped firing
 * entirely for every chat message):
 *   - Admin sends → notify the project owner (projects.created_by), unless
 *     the owner is the sender.
 *   - Non-admin sends → notify all active admins/super_admins except the
 *     sender.
 *   - A recipient who is currently viewing this project's chat window is
 *     skipped. "Currently viewing" is derived from chat_presence, which the
 *     /read endpoint (already called every 3s by the frontend's poll loop
 *     while the chat panel is open, see ProjectChat.tsx) keeps fresh. A
 *     recipient counts as active if their chat_presence row for this
 *     project was updated within the last 10 seconds (> 3x the poll
 *     interval, so a normal open tab is never treated as away).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleChat = handleChat;
const response_1 = require("../shared/response");
const db_1 = require("../shared/db");

const PRESENCE_WINDOW_SECONDS = 10;

async function handleChat(ctx, path) {
    const { userId, method, event } = ctx; // userId = Cognito sub (UUID)
    if (!userId)
        return (0, response_1.unauthorized)();

    // Parse /api/chat/:projectId or /api/chat/:projectId/read
    const segments = path.replace('/api/chat/', '').split('/');
    const projectId = segments[0];
    const action = segments[1]; // 'read' or undefined

    if (!projectId)
        return (0, response_1.err)('projectId required', 400);

    const pool = (0, db_1.getPool)();
    const db = await pool.connect();
    try {
        // Look up profile once — we need profiles.id for sender_id and read_by
        const profResult = await db.query(
            'SELECT id, full_name, role FROM profiles WHERE cognito_id = $1 LIMIT 1',
            [userId]
        );
        const profile = profResult.rows[0];
        if (!profile)
            return (0, response_1.err)('Profile not found', 404);
        const profileId = profile.id;

        // GET messages for a project
        if (method === 'GET') {
            const since = event.queryStringParameters?.since;
            let sql = `
        SELECT id, project_id, sender_id, sender_name, sender_role, message, read_by, created_at
        FROM project_messages
        WHERE project_id = $1
      `;
            const params = [projectId];
            if (since) {
                sql += ` AND created_at > $2`;
                params.push(since);
            }
            sql += ` ORDER BY created_at ASC LIMIT 200`;
            const { rows } = await db.query(sql, params);
            return (0, response_1.ok)(rows);
        }

        const body = JSON.parse(event.body ?? '{}');

        // POST /chat/:id/read — mark messages read
        // Also refreshes chat_presence, which is how send-message notification
        // logic below knows whether a recipient is currently viewing this chat.
        if (method === 'POST' && action === 'read') {
            await db.query(`
        UPDATE project_messages
        SET read_by = array_append(read_by, $2::uuid)
        WHERE project_id = $1 AND NOT (read_by @> ARRAY[$2::uuid])
      `, [projectId, profileId]);
            await db.query(`
        INSERT INTO chat_presence (project_id, profile_id, last_seen_at)
        VALUES ($1, $2, now())
        ON CONFLICT (project_id, profile_id) DO UPDATE SET last_seen_at = now()
      `, [projectId, profileId]);
            return (0, response_1.ok)({ success: true });
        }

        // POST /chat/:id — send message
        if (method === 'POST') {
            const { content } = body;
            if (!content?.trim())
                return (0, response_1.err)('content required', 400);
            const { rows } = await db.query(`
        INSERT INTO project_messages (project_id, sender_id, sender_name, sender_role, message, read_by)
        VALUES ($1, $2, $3, $4, $5, ARRAY[$2::uuid])
        RETURNING id, project_id, sender_id, sender_name, sender_role, message, read_by, created_at
      `, [projectId, profileId, profile.full_name, profile.role, content.trim()]);
            const savedMessage = rows[0];

            // Fire-and-forget notification fan-out. Never let a notification
            // failure fail the send — the message is already saved above.
            notifyOnChatMessage(db, { projectId, profile, profileId, message: content.trim() }).catch(() => {});

            return (0, response_1.ok)(savedMessage);
        }

        return (0, response_1.err)('Method not allowed', 405);
    }
    finally {
        db.release();
    }
}

/** Determines recipients, filters out anyone currently viewing this chat, and
 * writes their notification rows directly (same shape as the notifications
 * table used elsewhere in the app). */
async function notifyOnChatMessage(db, { projectId, profile, profileId, message }) {
    const isAdminSender = profile.role === 'admin' || profile.role === 'super_admin';
    let recipientIds = [];
    let projectName = '';

    if (isAdminSender) {
        const projRes = await db.query(
            'SELECT created_by, project_owner, client_name FROM projects WHERE id = $1',
            [projectId]
        );
        const proj = projRes.rows[0];
        if (!proj) return;
        projectName = proj.project_owner || proj.client_name || '';
        if (proj.created_by && proj.created_by !== profileId) {
            recipientIds = [proj.created_by];
        }
    } else {
        const projRes = await db.query(
            'SELECT project_owner, client_name FROM projects WHERE id = $1',
            [projectId]
        );
        projectName = projRes.rows[0]?.project_owner || projRes.rows[0]?.client_name || '';
        const adminsRes = await db.query(
            "SELECT id FROM profiles WHERE role IN ('admin','super_admin') AND is_active = true AND id != $1",
            [profileId]
        );
        recipientIds = adminsRes.rows.map((r) => r.id);
    }

    if (!recipientIds.length) return;

    // Exclude recipients whose chat_presence for this project was refreshed
    // within the last PRESENCE_WINDOW_SECONDS — they're currently viewing it.
    const presenceRes = await db.query(
        `SELECT profile_id FROM chat_presence
     WHERE project_id = $1 AND profile_id = ANY($2::uuid[])
       AND last_seen_at > now() - interval '${PRESENCE_WINDOW_SECONDS} seconds'`,
        [projectId, recipientIds]
    );
    const activeNow = new Set(presenceRes.rows.map((r) => r.profile_id));
    const toNotify = recipientIds.filter((id) => !activeNow.has(id));
    if (!toNotify.length) return;

    const senderName = profile.full_name || 'Someone';
    const title = isAdminSender ? 'New message from admin' : `Message from ${senderName}`;
    const bodyText = `${senderName}: ${message.slice(0, 80)}${message.length > 80 ? '…' : ''}`;

    for (const userId of toNotify) {
        await db.query(
            `INSERT INTO public.notifications (user_id, type, title, body, project_id, project_name)
       VALUES ($1, 'chat_message', $2, $3, $4, $5)`,
            [userId, title, bodyText, projectId, projectName]
        );
    }
}
