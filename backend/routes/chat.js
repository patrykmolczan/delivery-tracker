"use strict";
/**
 * routes/chat.ts — Project chat messages
 * GET  /api/chat/:projectId          → fetch messages
 * POST /api/chat/:projectId          → send message
 * POST /api/chat/:projectId/read     → mark messages read
 *
 * Aurora schema: project_messages(id, project_id, sender_id, sender_name, sender_role, message, read_by, created_at)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleChat = handleChat;
const response_1 = require("../shared/response");
const db_1 = require("../shared/db");

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
        if (method === 'POST' && action === 'read') {
            await db.query(`
        UPDATE project_messages
        SET read_by = array_append(read_by, $2::uuid)
        WHERE project_id = $1 AND NOT (read_by @> ARRAY[$2::uuid])
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
            return (0, response_1.ok)(rows[0]);
        }

        return (0, response_1.err)('Method not allowed', 405);
    }
    finally {
        db.release();
    }
}
