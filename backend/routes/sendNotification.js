"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendNotification = handleSendNotification;
/**
 * routes/sendNotification.ts — email notification via Resend HTTP API
 * POST /api/send-notification
 * Body: { type, to, project, files?, newStatus?, oldDays?, newDays?, reason?, actionType?, message?, items?, adminName? }
 */
const emailTemplates_1 = require("../lib/emailTemplates");
const response_1 = require("../shared/response");
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
        body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [to],
            subject,
            html,
        }),
    });
    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`Resend API error ${res.status}: ${err}`);
    }
}
async function handleSendNotification(body, _user) {
    try {
        const { type, to, project, files, newStatus, oldDays, newDays, reason, actionType, message, items, adminName, } = body ?? {};
        if (!type || !to || !project) {
            return (0, response_1.err)('Missing required fields: type, to, project');
        }
        let payload;
        switch (type) {
            case 'completed':
                payload = await (0, emailTemplates_1.buildCompletionEmail)(to, project);
                break;
            case 'delivery_file':
                payload = await (0, emailTemplates_1.buildDeliveryFileEmail)(to, project, files || []);
                break;
            case 'status_changed':
                payload = await (0, emailTemplates_1.buildStatusChangeEmail)(to, project, newStatus || project.status);
                break;
            case 'eta_changed':
                payload = await (0, emailTemplates_1.buildETAChangeEmail)(to, project, oldDays ?? null, newDays ?? 0, reason ?? null);
                break;
            case 'project_feedback':
                payload = await (0, emailTemplates_1.buildProjectFeedbackEmail)(to, project, actionType || 'hold', message || '', items || [], adminName || 'Admin');
                break;
            default:
                return (0, response_1.err)(`Unknown notification type: ${type}`);
        }
        await sendViaResend(payload.to, payload.subject, payload.html);
        return (0, response_1.ok)({ success: true, type, to });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
