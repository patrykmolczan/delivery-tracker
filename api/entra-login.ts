/**
 * api/entra-login.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/entra-login
 *
 * Initiates the Microsoft Entra ID OIDC authorization flow.
 *
 * Steps:
 *   1. Read Entra credentials from app_settings (decrypts client secret).
 *   2. Generate PKCE code_verifier + code_challenge.
 *   3. Generate a random state token for CSRF protection.
 *   4. Store {state, code_verifier, expires_at} in the sso_state table.
 *   5. Return the Microsoft authorization URL to the client.
 *
 * The client (EntraCallbackPage / useEntraSSO) redirects the browser to
 * the returned URL. Microsoft authenticates the user and redirects back
 * to the configured redirect_uri with `code` and `state` query params.
 *
 * Response: { authorizationUrl: string }
 * Error:    { error: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
} from './lib/entraOIDC'
import { readEntraCredentials } from './lib/entraSettings'

const SUPABASE_URL             = process.env.VITE_SUPABASE_URL             || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY    || ''

/** SSO state expires after 10 minutes — enough for any reasonable login flow. */
const STATE_TTL_SECONDS = 600

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // ── 1. Read credentials from DB ──────────────────────────────────────────
    const creds = await readEntraCredentials()

    // ── 2. Generate PKCE material ────────────────────────────────────────────
    const codeVerifier  = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state         = generateState()

    // ── 3. Persist state + code_verifier for the callback to retrieve ────────
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY — cannot store SSO state')
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const expiresAt = new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString()
    const { error: stateError } = await supabaseAdmin
      .from('sso_state')
      .insert({ state, code_verifier: codeVerifier, expires_at: expiresAt })

    if (stateError) {
      throw new Error(`Failed to store SSO state: ${stateError.message}`)
    }

    // ── 4. Build the Microsoft authorization URL ─────────────────────────────
    const authorizationUrl = buildAuthorizationUrl(
      creds.tenantId,
      creds.clientId,
      creds.redirectUri,
      state,
      codeChallenge,
    )

    // ── 5. Return the URL ─────────────────────────────────────────────────────
    return res.status(200).json({ authorizationUrl })

  } catch (err: any) {
    console.error('[entra-login] Error:', err.message)
    return res.status(500).json({
      error: err.message || 'Failed to initiate Microsoft sign-in',
    })
  }
}
