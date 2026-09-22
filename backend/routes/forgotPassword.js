"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleForgotPassword = handleForgotPassword;
// ── In-memory rate limit (per Lambda instance) ────────────────────────────────
const _rlStore = new Map();
const RL_MAX = 5;
const RL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
function _checkRateLimit(ip) {
    if (!ip) return false;
    const now = Date.now();
    const entry = _rlStore.get(ip);
    if (!entry || (now - entry.windowStart) > RL_WINDOW_MS) {
        _rlStore.set(ip, { count: 1, windowStart: now });
        return false;
    }
    if (entry.count >= RL_MAX) return true;
    entry.count++;
    return false;
}
/**
 * routes/forgotPassword.ts — Trigger Cognito forgot-password flow
 * POST /api/forgot-password  (public — no auth required)
 *
 * Triggers Cognito to send a verification code to the user's email.
 * The user then uses that code + new password to complete the reset.
 *
 * NOTE: Always returns 200 to prevent email enumeration.
 */
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const response_1 = require("../shared/response");
const REGION = process.env.AWS_REGION || 'us-east-2';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.VITE_COGNITO_CLIENT_ID || '';
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: REGION });
async function handleForgotPassword(body, ip) {
    try {
        if (_checkRateLimit(ip)) {
            return { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '900' }, body: JSON.stringify({ error: 'Too many requests. Please try again later.' }) };
        }
        const { email } = body ?? {};
        if (!email) {
            // Return 200 to prevent enumeration
            return (0, response_1.ok)({ success: true });
        }
        try {
            await cognitoClient.send(new client_cognito_identity_provider_1.ForgotPasswordCommand({
                ClientId: CLIENT_ID,
                Username: email,
            }));
        }
        catch (cognitoErr) {
            // Log but don't expose — always return success
            console.error('[forgot-password] Cognito error:', cognitoErr.message);
        }
        return (0, response_1.ok)({ success: true });
    }
    catch (e) {
        return (0, response_1.serverError)(e);
    }
}
