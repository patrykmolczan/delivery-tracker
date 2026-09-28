"use strict";
/**
 * routes/session.js
 *
 * Implements the /api/session endpoint that the frontend has already been
 * calling (see src/pages/CognitoCallbackPage.tsx, src/lib/cognitoAuth.ts,
 * src/contexts/AuthContext.tsx) — this route never existed server-side, so
 * every call to it has been silently 404ing (all three call sites treat that
 * as non-fatal by design, which is why nothing broke outright).
 *
 * This does NOT touch, replace, or participate in the SSO/SAML login
 * handshake itself (Cognito <-> IAM Identity Center). It only manages a
 * plain Cognito refresh token, delivered as an HttpOnly Secure cookie, for
 * BOTH password and SSO logins equally, exactly as the existing frontend
 * comments already specify:
 *
 *   POST /api/session { action: 'store',   refreshToken } -> sets cookie
 *   POST /api/session { action: 'refresh' }               -> reads cookie,
 *       calls Cognito InitiateAuth(REFRESH_TOKEN_AUTH), returns new
 *       { accessToken, idToken, expiresIn }
 *   POST /api/session { action: 'clear' }                 -> expires cookie
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSession = handleSession;

const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { CORS_HEADERS, ok, err } = require('../shared/response');

const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-2' });

const COOKIE_NAME = '__rt';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches the app client's RefreshTokenValidity

function parseCookies(event) {
  // API Gateway HTTP API (payload format 2.0) delivers cookies as a separate
  // `cookies` array (["name=value", ...]), not a combined Cookie header —
  // event.headers.cookie is only populated for the older REST API / v1
  // payload format. Support both so this works regardless of API type.
  const out = {};
  const pairs = Array.isArray(event.cookies)
    ? event.cookies
    : (event.headers?.cookie || event.headers?.Cookie || '').split(';');
  pairs.forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function buildCookie(value, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

function withCookie(body, cookieValue, maxAgeSeconds, status = 200) {
  return {
    statusCode: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    cookies: [buildCookie(cookieValue, maxAgeSeconds)],
    body: JSON.stringify(body),
  };
}

async function handleSession(body, event) {
  const action = body?.action;

  if (action === 'store') {
    const { refreshToken } = body || {};
    if (!refreshToken) return err('Missing refreshToken', 400);
    return withCookie({ ok: true }, refreshToken, COOKIE_MAX_AGE_SECONDS);
  }

  if (action === 'clear') {
    return withCookie({ ok: true }, '', 0);
  }

  if (action === 'refresh') {
    const cookies = parseCookies(event);
    const refreshToken = cookies[COOKIE_NAME];
    if (!refreshToken) return err('No session cookie', 401);

    try {
      const result = await cognito.send(new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }));
      const auth = result.AuthenticationResult;
      if (!auth?.AccessToken || !auth?.IdToken) {
        return err('Refresh failed', 401);
      }
      return ok({
        accessToken: auth.AccessToken,
        idToken: auth.IdToken,
        expiresIn: auth.ExpiresIn,
      });
    } catch (e) {
      console.error('[session] refresh failed:', e?.name || e);
      // Expired/revoked refresh token -> clear the now-useless cookie so the
      // client doesn't keep retrying it, and tell the frontend to re-auth.
      return withCookie({ error: 'Refresh failed' }, '', 0, 401);
    }
  }

  return err('Unknown action', 400);
}
