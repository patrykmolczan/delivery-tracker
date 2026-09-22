"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendWelcome = handleSendWelcome;
/**
 * routes/sendWelcome.ts — Send welcome email to new user
 * POST /api/send-welcome
 */
const emailTemplates_1 = require("../lib/emailTemplates");
const response_1 = require("../shared/response");
const { queryOne } = require("../shared/db");
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Delivery Tracker';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const FROM_ADDRESS = `${FROM_NAME} <${FROM_EMAIL}>`;
async function sendViaResend(to, subject, html) {
    if (!RESEND_API_KEY)
        throw new Error('RESEND_API_KEY not configured');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Resend API error ${res.status}: ${errText}`);
    }
}
async function handleSendWelcome(body, user) {
    try {
        if (!user)
            return (0, response_1.err)('Unauthorized', 401);
        // Only admins can send welcome emails
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return (0, response_1.err)('Forbidden', 403);
        }
        const { userId } = body ?? {};
        if (!userId) {
            return (0, response_1.err)('Missing required field: userId');
        }

        // Opportunistic cleanup of expired rows
        await queryOne('SELECT public.cleanup_expired_welcome_pending()').catch(() => {});

        // Atomically consume the welcome_pending row (audit H-2: server resolves temp password from DB)
        const pending = await queryOne(
            'DELETE FROM welcome_pending WHERE user_id = $1 AND expires_at > NOW() RETURNING temp_password',
            [userId]
        );
        if (!pending) {
            return (0, response_1.err)('No pending welcome email found for this user (may have expired or already been sent)', 404);
        }

        // Look up recipient profile
        const profile = await queryOne(
            'SELECT email, full_name FROM profiles WHERE id = $1',
            [userId]
        );
        if (!profile) {
            return (0, response_1.err)('User not found', 404);
        }

        const payload = await (0, emailTemplates_1.buildWelcomeEmail)(profile.email, profile.full_name || profile.email, pending.temp_password);
        await sendViaResend(payload.to, payload.subject, payload.html);
        return (0, response_1.ok)({ success: true, to: profile.email });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
