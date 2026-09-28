"use strict";
/**
 * routes/loginAttempts.js
 * ─────────────────────────────────────────────────────────────────────────
 * Passive login-attempt audit trail. Does NOT participate in the login/SSO
 * flow itself — it only records what already happened, after the fact.
 *
 * POST /api/login-attempts  (public — no auth; called from the callback
 *   page before any session exists, and from the login page on password
 *   failures). IP-rate-limited to prevent abuse. Never throws in a way
 *   that could surface to or block the caller's real login attempt.
 *
 * GET  /api/login-attempts  (super-admin only) — query history, optionally
 *   filtered by ?email=
 * ─────────────────────────────────────────────────────────────────────────
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordLoginAttempt = recordLoginAttempt;
exports.getLoginAttempts = getLoginAttempts;

const { query } = require('../shared/db');
const { ok, err, serverError } = require('../shared/response');

function isSuperAdmin(user) {
    return user?.role === 'super_admin';
}

// ── In-memory per-IP rate limit (per Lambda instance) ──────────────────────
const _rlStore = new Map();
const RL_MAX = 30;
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
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

// Only the last RETENTION_DAYS of history is kept / shown.
const RETENTION_DAYS = 30;
async function purgeOldLoginAttempts() {
    try {
        await query(`DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`);
    } catch (e) {
        console.error('[login-attempts] purge failed:', e);
    }
}

const MAX_LEN = 500;
function clip(s) {
    if (typeof s !== 'string') return null;
    return s.slice(0, MAX_LEN);
}

async function recordLoginAttempt(body, ip) {
    try {
        if (_checkRateLimit(ip)) {
            return { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }, body: JSON.stringify({ error: 'Too many requests.' }) };
        }
        const { email, method, success, reason, userAgent } = body || {};
        if (!email || typeof email !== 'string' || email.length > 320) {
            return err('Invalid email', 400);
        }
        if (typeof success !== 'boolean') {
            return err('Invalid success flag', 400);
        }
        await query(
            `INSERT INTO login_attempts (email, method, success, reason, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [clip(email.toLowerCase()), clip(method) || 'sso', success, clip(reason), clip(userAgent)]
        );
        // Opportunistic retention purge (~1 in 20 inserts); never affects the response.
        if (Math.random() < 0.05) await purgeOldLoginAttempts();
        return ok({ recorded: true });
    } catch (e) {
        // Never let audit logging surface as a real error to a login attempt.
        console.error('[login-attempts] record failed:', e);
        return ok({ recorded: false });
    }
}

async function getLoginAttempts(params, user) {
    try {
        if (!user) return err('Unauthorized', 401);
        if (!isSuperAdmin(user)) return err('Forbidden', 403);
        const email = params?.email ? String(params.email).toLowerCase().trim() : null;
        const limitNum = parseInt(params?.limit, 10);
        const limit = Number.isFinite(limitNum) ? Math.min(Math.max(limitNum, 1), 200) : 50;
        await purgeOldLoginAttempts();
        const rows = email
            ? await query(
                `SELECT id, email, method, success, reason, user_agent, created_at
                 FROM login_attempts WHERE email = $1 AND created_at >= NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT $2`,
                [email, limit]
              )
            : await query(
                `SELECT id, email, method, success, reason, user_agent, created_at
                 FROM login_attempts WHERE created_at >= NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT $1`,
                [limit]
              );
        return ok(rows);
    } catch (e) {
        return serverError(e);
    }
}
