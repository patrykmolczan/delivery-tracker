/**
 * aws/functions/session.ts
 * AUTH-1 Sprint N+1 — Refresh Token HttpOnly Cookie Endpoint
 *
 * Exposes three operations via the method discriminator in the request body:
 *
 *   POST  { action: 'store',   refreshToken: '<token>' }
 *         Called by CognitoCallbackPage immediately after SSO token exchange.
 *         Stores the refresh token in an HttpOnly Secure SameSite=Strict cookie.
 *         Returns: { ok: true }
 *
 *   POST  { action: 'refresh' }
 *         Called by cognitoAuth.ts refreshSession() when the SDK needs new tokens.
 *         Reads the refreshToken cookie, calls Cognito InitiateAuth, returns new
 *         access + ID tokens in the JSON body (NOT in cookies — short-lived tokens
 *         go into sessionStorage via splitStorage as before).
 *         Returns: { accessToken, idToken, expiresIn }
 *
 *   POST  { action: 'clear' }
 *         Called by AuthContext signOut(). Expires the cookie immediately.
 *         Returns: { ok: true }
 *
 * Cookie spec:
 *   Name:     __rt
 *   HttpOnly: true   → JavaScript cannot read it
 *   Secure:   true   → HTTPS only (Amplify always HTTPS in prod)
 *   SameSite: Strict → No cross-origin cookie sends
 *   Path:     /api/session  → Scoped — not sent on every API call
 *   MaxAge:   30 days (2592000s) — matches Cognito refresh token default
 *
 * Security notes:
 *   - The refresh token itself never appears in a JS-readable location after
 *     this endpoint is in use. The store action is the only time it transits
 *     JS memory, immediately after the token exchange — that window is ~1 event loop tick.
 *   - CORS on API Gateway is already restricted to the Amplify origin (INF-2 fix),
 *     so SameSite=Strict is defence-in-depth rather than the primary CSRF control.
 *   - The Lambda reads VITE_COGNITO_CLIENT_ID and VITE_COGNITO_USER_POOL_ID from
 *     environment — these are already present in the SAM globals block.
 */

import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'

const COOKIE_NAME = '__rt'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days in seconds

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.VITE_AWS_REGION ?? 'us-east-2',
})

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map(pair => {
      const [k, ...rest] = pair.trim().split('=')
      return [k.trim(), decodeURIComponent(rest.join('=').trim())]
    })
  )
}

function setCookieHeader(value: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    'Path=/api/session',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ')
}

function clearCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    'Max-Age=0',
    'Path=/api/session',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ')
}

export const handler = async (event: any): Promise<any> => {
  const method = (
    event.requestContext?.http?.method ||
    event.httpMethod ||
    'POST'
  ).toUpperCase()

  // Only POST is accepted
  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  let body: { action?: string; refreshToken?: string } = {}
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '{}')
    body = JSON.parse(raw)
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  const { action } = body

  // ── action: store ───────────────────────────────────────────────────────────
  if (action === 'store') {
    const { refreshToken } = body
    if (!refreshToken || typeof refreshToken !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'refreshToken is required' }),
      }
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader(refreshToken, COOKIE_MAX_AGE),
      },
      body: JSON.stringify({ ok: true }),
    }
  }

  // ── action: refresh ─────────────────────────────────────────────────────────
  if (action === 'refresh') {
    const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie)
    const refreshToken = cookies[COOKIE_NAME]
      ? decodeURIComponent(cookies[COOKIE_NAME])
      : undefined

    if (!refreshToken) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No refresh token cookie — please sign in again' }),
      }
    }

    const clientId = process.env.VITE_COGNITO_CLIENT_ID
    if (!clientId) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server configuration error' }),
      }
    }

    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      })
      const response = await cognitoClient.send(command)
      const result = response.AuthenticationResult

      if (!result?.AccessToken || !result?.IdToken) {
        throw new Error('Incomplete token response from Cognito')
      }

      // If Cognito rotates the refresh token, update the cookie
      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (result.RefreshToken) {
        responseHeaders['Set-Cookie'] = setCookieHeader(result.RefreshToken, COOKIE_MAX_AGE)
      }

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          accessToken: result.AccessToken,
          idToken: result.IdToken,
          expiresIn: result.ExpiresIn ?? 3600,
        }),
      }
    } catch (err: any) {
      // Cognito returns NotAuthorizedException when the refresh token is expired/revoked
      const isExpired =
        err?.name === 'NotAuthorizedException' ||
        err?.name === 'TokenExpiredException'

      return {
        statusCode: isExpired ? 401 : 500,
        headers: {
          'Content-Type': 'application/json',
          // Expire the cookie if the refresh token is no longer valid
          ...(isExpired ? { 'Set-Cookie': clearCookieHeader() } : {}),
        },
        body: JSON.stringify({
          error: isExpired
            ? 'Session expired — please sign in again'
            : 'Failed to refresh session',
        }),
      }
    }
  }

  // ── action: clear ───────────────────────────────────────────────────────────
  if (action === 'clear') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader(),
      },
      body: JSON.stringify({ ok: true }),
    }
  }

  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: `Unknown action: ${action}` }),
  }
}
