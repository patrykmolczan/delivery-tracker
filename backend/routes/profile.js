"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProfile = handleProfile;
/**
 * routes/profile.ts — User profile CRUD
 * SSO fix: falls back to email lookup if cognito_id misses (SSO users get a different sub),
 * then auto-links the SSO sub so future lookups hit the primary path.
 */
const db_1 = require("../shared/db");
const response_1 = require("../shared/response");
async function handleProfile(ctx) {
    const { userId, userEmail, method, event } = ctx;
    if (!userId)
        return (0, response_1.err)('Unauthorized', 401);
    if (method === 'GET') {
        // Primary lookup by cognito_id
        let row = await (0, db_1.queryOne)(
            `SELECT id, email, full_name, role, avatar_url, password_change_required,
                    cognito_id, created_at, has_completed_onboarding
             FROM profiles WHERE cognito_id = $1 LIMIT 1`,
            [userId]
        );

        // Fallback: SSO users get a different Cognito sub than their regular-login sub.
        // If no match by cognito_id, try email lookup and auto-link the SSO sub.
        if (!row && userEmail) {
            row = await (0, db_1.queryOne)(
                `SELECT id, email, full_name, role, avatar_url, password_change_required,
                        cognito_id, created_at, has_completed_onboarding
                 FROM profiles WHERE email = $1 LIMIT 1`,
                [userEmail]
            );
            if (row) {
                // Link the SSO sub so future lookups hit the primary path
                await (0, db_1.query)(
                    `UPDATE profiles SET cognito_id = $1 WHERE email = $2`,
                    [userId, userEmail]
                );
                row.cognito_id = userId;
            }
        }

        if (!row) {
            // Auto-provision: brand-new SSO user with no existing profile.
            // Create a 'user' role profile so any authenticated SSO employee can access the app.
            const nameParts = (userEmail || '').split('@')[0].split(/[._\-]+/)
                .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
            const derivedName = nameParts.filter(Boolean).join(' ') || userEmail || 'New User';
            row = await (0, db_1.queryOne)(
                `INSERT INTO profiles (id, email, full_name, role, is_active, password_change_required, cognito_id, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1, $2, 'user', true, false, $3, now(), now())
                 RETURNING id, email, full_name, role, avatar_url, password_change_required, cognito_id, created_at, has_completed_onboarding`,
                [userEmail, derivedName, userId]
            );
        }
        return (0, response_1.ok)(row);
    }
    if (method === 'PATCH') {
        const body = JSON.parse(event.body ?? '{}');
        const { full_name, avatar_url, has_completed_onboarding } = body;
        // Onboarding-only PATCH (used by the first-login guided tour) — leaves name/avatar untouched.
        if (has_completed_onboarding !== undefined && full_name === undefined && avatar_url === undefined) {
            const row = await (0, db_1.queryOne)(
                `UPDATE profiles SET has_completed_onboarding=$1 WHERE cognito_id=$2 RETURNING *`,
                [has_completed_onboarding, userId]
            );
            return (0, response_1.ok)(row);
        }
        const row = await (0, db_1.queryOne)(
            `UPDATE profiles SET full_name=$1, avatar_url=$2 WHERE cognito_id=$3 RETURNING *`,
            [full_name, avatar_url, userId]
        );
        return (0, response_1.ok)(row);
    }
    return (0, response_1.err)('Method not allowed', 405);
}
