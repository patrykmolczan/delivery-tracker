"use strict";
/**
 * response.ts — CORS + response helpers for Lambda API handlers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CORS_HEADERS = void 0;
exports.ok = ok;
exports.err = err;
exports.preflight = preflight;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.notFound = notFound;
exports.serverError = serverError;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
exports.CORS_HEADERS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
};
function ok(body, status = 200) {
    return {
        statusCode: status,
        headers: { ...exports.CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}
function err(message, status = 400) {
    return {
        statusCode: status,
        headers: { ...exports.CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: message }),
    };
}
function preflight() {
    return { statusCode: 200, headers: exports.CORS_HEADERS, body: '' };
}
function unauthorized() {
    return err('Unauthorized', 401);
}
function forbidden() {
    return err('Forbidden', 403);
}
function notFound(resource = 'Resource') {
    return err(`${resource} not found`, 404);
}
function serverError(e) {
    console.error('Server error:', e);
    return err('Internal server error', 500);
}
