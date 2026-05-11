/**
 * api/lib/entraOIDC.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Microsoft Entra ID (Azure AD) OIDC utilities for the serverless functions.
 *
 * Handles:
 *   • PKCE code_verifier/code_challenge generation
 *   • State nonce generation
 *   • Microsoft authorization URL construction
 *   • Authorization code → token exchange (server-side, keeps secret off client)
 *   • ID token validation (signature via JWKS, claims: iss, aud, exp, nonce)
 *   • User info extraction from the validated ID token
 *
 * No external npm packages required — uses Node.js built-in `crypto` only.
 * Requires Node 16+ (available on all current Vercel runtimes).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash, randomBytes, createHmac, createVerify, createPublicKey } from 'crypto'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MicrosoftTokenResponse {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

export interface EntraIDTokenClaims {
  /** Azure Object ID — stable unique identifier for the user */
  oid: string
  /** User Principal Name — usually the work email */
  upn?: string
  /** Preferred email */
  email?: string
  /** Display name */
  name?: string
  /** Given name */
  given_name?: string
  /** Family name */
  family_name?: string
  /** Subject — unique per app, stable per user */
  sub: string
  /** Audience — should match your client_id */
  aud: string
  /** Issuer */
  iss: string
  /** Expiry (unix seconds) */
  exp: number
  /** Issued at */
  iat: number
  /** Tenant ID */
  tid?: string
}

export interface ExtractedUser {
  email: string
  displayName: string
  azureObjectId: string
  tenantId?: string
}

// ── PKCE Helpers ─────────────────────────────────────────────────────────────

/** Generate a cryptographically random PKCE code_verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
  return randomBytes(48).toString('base64url')
}

/** Derive the PKCE code_challenge from a code_verifier (S256 method). */
export function generateCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

/** Generate a cryptographically random state token (CSRF protection). */
export function generateState(): string {
  return randomBytes(32).toString('base64url')
}

// ── Authorization URL ─────────────────────────────────────────────────────────

/**
 * Build the Microsoft Entra ID authorization URL.
 *
 * @param tenantId      Azure tenant ID (GUID) or domain (e.g. "contoso.onmicrosoft.com").
 *                      Use "common" for multi-tenant apps.
 * @param clientId      Azure Application (client) ID.
 * @param redirectUri   The URI Microsoft will redirect to after auth.
 * @param state         CSRF protection nonce (store server-side).
 * @param codeChallenge PKCE S256 challenge derived from code_verifier.
 */
export function buildAuthorizationUrl(
  tenantId: string,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`
  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          redirectUri,
    scope:                 'openid profile email offline_access',
    response_mode:         'query',
    state:                 state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    // Prompt the user to select an account (good UX for multi-account environments)
    prompt:                'select_account',
  })
  return `${base}?${params.toString()}`
}

// ── Token Exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for tokens at Microsoft's token endpoint.
 * This runs entirely server-side — the client_secret never touches the browser.
 */
export async function exchangeCodeForTokens(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<MicrosoftTokenResponse> {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  })

  const response = await fetch(tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })

  const data = await response.json() as MicrosoftTokenResponse

  if (data.error) {
    throw new Error(`Microsoft token exchange failed: ${data.error} — ${data.error_description}`)
  }
  if (!data.id_token) {
    throw new Error('Microsoft token response missing id_token')
  }

  return data
}

// ── JWKS + ID Token Validation ────────────────────────────────────────────────

interface JWK {
  kty: string
  use?: string
  kid: string
  n: string
  e: string
  x5c?: string[]
}

interface JWKSResponse {
  keys: JWK[]
}

// Simple in-memory JWKS cache (per cold-start — resets on function recycling, fine for Lambda)
const jwksCache: Map<string, { keys: JWK[]; fetchedAt: number }> = new Map()
const JWKS_TTL_MS = 60 * 60 * 1000 // 1 hour

async function fetchJWKS(tenantId: string): Promise<JWK[]> {
  // Use the common JWKS endpoint so we don't need to know the exact tenant GUID
  // for tenants identified by domain name. For single-tenant apps with a GUID tenant,
  // the tenant-specific endpoint would also work.
  const jwksUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`

  const cached = jwksCache.get(tenantId)
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    return cached.keys
  }

  const res = await fetch(jwksUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch Microsoft JWKS: ${res.status} ${res.statusText}`)
  }
  const data = await res.json() as JWKSResponse
  jwksCache.set(tenantId, { keys: data.keys, fetchedAt: Date.now() })
  return data.keys
}

/**
 * Decode a JWT without verification (used to extract header claims like `kid`).
 * Returns null if the token is malformed.
 */
function decodeJWTPart<T>(b64url: string): T | null {
  try {
    const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      b64url.length + (4 - (b64url.length % 4)) % 4, '='
    )
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T
  } catch {
    return null
  }
}

/**
 * Validate a Microsoft Entra ID ID token:
 *   1. Decode header to get `kid`
 *   2. Fetch matching JWK from Microsoft's JWKS endpoint
 *   3. Verify RSA-SHA256 signature
 *   4. Validate claims: iss, aud, exp
 *
 * Throws on validation failure. Returns the decoded claims on success.
 */
export async function validateIdToken(
  idToken: string,
  tenantId: string,
  clientId: string,
): Promise<EntraIDTokenClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('ID token is not a valid JWT (expected 3 parts)')

  const [headerB64, payloadB64, signatureB64] = parts

  const header = decodeJWTPart<{ kid: string; alg: string }>(headerB64)
  if (!header?.kid) throw new Error('ID token header missing kid')

  const payload = decodeJWTPart<EntraIDTokenClaims>(payloadB64)
  if (!payload) throw new Error('ID token payload could not be decoded')

  // ── Claim validation ──
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp < now) throw new Error('ID token has expired')
  if (payload.aud !== clientId) throw new Error(`ID token audience mismatch: got ${payload.aud}, expected ${clientId}`)

  // Microsoft issues tokens from tenant-specific or common issuers.
  // Accept both the tenant-specific issuer and the v2 common issuer.
  const tenantGuid = payload.tid ?? tenantId
  const validIssuers = [
    `https://login.microsoftonline.com/${tenantGuid}/v2.0`,
    `https://sts.windows.net/${tenantGuid}/`,
  ]
  if (!validIssuers.includes(payload.iss)) {
    throw new Error(`ID token issuer not trusted: ${payload.iss}`)
  }

  // ── Signature validation ──
  const keys = await fetchJWKS(tenantId === 'common' ? 'common' : tenantGuid)
  const jwk = keys.find(k => k.kid === header.kid)
  if (!jwk) throw new Error(`No matching JWK found for kid=${header.kid}`)

  // Reconstruct the signing input (header.payload in ASCII)
  const signingInput = `${headerB64}.${payloadB64}`

  // Build a Node.js public key from the JWK
  const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' })

  // Decode the base64url signature
  const signature = Buffer.from(
    signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  )

  const isValid = (await import('crypto')).verify(
    'sha256',
    Buffer.from(signingInput),
    publicKey,
    signature,
  )

  if (!isValid) throw new Error('ID token signature verification failed')

  return payload
}

// ── User extraction ───────────────────────────────────────────────────────────

/**
 * Extract the canonical email and display name from validated Entra ID token claims.
 * Priority order for email: upn → email → sub@unknown (fallback, shouldn't happen).
 */
export function extractUserFromClaims(claims: EntraIDTokenClaims): ExtractedUser {
  const email = claims.upn ?? claims.email

  if (!email) {
    throw new Error(
      'Microsoft ID token did not include an email address. ' +
      'Ensure the app registration requests the "email" scope and the user\'s ' +
      'account has an email address configured in Entra ID.'
    )
  }

  const displayName =
    claims.name ??
    [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
    email.split('@')[0]

  return {
    email:         email.toLowerCase().trim(),
    displayName,
    azureObjectId: claims.oid,
    tenantId:      claims.tid,
  }
}
