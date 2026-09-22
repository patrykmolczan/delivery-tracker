"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
exports.isAdmin = isAdmin;
exports.isSuperAdmin = isSuperAdmin;

/**
 * auth.ts — Cognito JWT verification for Lambda API handlers
 * Role is read from the JWT custom:role claim.
 * If missing (old cached token before app client ReadAttributes fix),
 * we fall back to a DB lookup so admins are never locked out.
 */
const aws_jwt_verify_1 = require("aws-jwt-verify");
const db_1 = require("./db");

let verifier = null;
function getVerifier() {
    if (!verifier) {
        verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
            userPoolId: process.env.COGNITO_USER_POOL_ID,
            tokenUse: 'id',
            clientId: process.env.COGNITO_CLIENT_ID,
        });
    }
    return verifier;
}

/**
 * Extract and verify the Bearer token from Authorization header.
 * Returns AuthUser on success, null on failure.
 * Falls back to DB role lookup when JWT custom:role claim is missing.
 */
async function verifyToken(authHeader) {
    if (!authHeader) return null;
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    try {
        const payload = await getVerifier().verify(token);
        let role = payload['custom:role'] ?? undefined;
        const fullName = payload['custom:full_name'] ?? undefined;

        // Fallback: if custom:role missing from JWT (cached pre-fix token),
        // look it up from Aurora profiles table
        if (!role) {
            try {
                const profileRow = await db_1.queryOne(
                    'SELECT role FROM public.profiles WHERE cognito_id = $1',
                    [payload.sub]
                );
                if (profileRow?.role) role = profileRow.role;
            } catch (_) {
                // Non-fatal — leave role undefined
            }
        }

        return {
            sub: payload.sub,
            email: payload.email ?? '',
            role,
            fullName,
        };
    } catch {
        return null;
    }
}

function isAdmin(user) {
    return user?.role === 'admin' || user?.role === 'super_admin';
}

function isSuperAdmin(user) {
    return user?.role === 'super_admin';
}
