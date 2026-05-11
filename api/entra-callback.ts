/**
 * api/entra-callback.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/entra-callback
 * Body: { code: string, state: string }
 *
 * Completes the Microsoft Entra ID OIDC authorization code flow:
 *
 *   1. Validate state against the sso_state table (CSRF protection).
 *   2. Retrieve code_verifier from sso_state (PKCE).
 *   3. Delete the used state row (one-time use).
 *   4. Exchange the authorization code for ID/access tokens at Microsoft's
 *      token endpoint (server-side, client_secret never leaves server).
 *   5. Validate the ID token: JWKS signature, iss, aud, exp.
 *   6. Extract email + display name from the validated claims.
 *   7. Provision the Supabase user:
 *        - If user doesn't exist: createUser (email_confirm: true)
 *        - If user exists: noop (already there)
 *   8. Generate a Supabase magic-link token (same mechanism as forgot-password).
 *   9. Return { token_hash, type } to the client.
 *
 * The client calls supabase.auth.verifyOtp({ token_hash, type: 'email' })
 * which exchanges the hash for a full session, triggering onAuthStateChange(SIGNED_IN).
 *
 * Response: { token_hash: string, type: 'email' }
 * Error:    { error: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import {
  exchangeCodeForTokens,
  validateIdToken,
  extractUserFromClaims,
} from './lib/entraOIDC'
import { readEntraCredentials } from './lib/entraSettings'

const SUPABASE_URL              = process.env.VITE_SUPABASE_URL            || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY    || ''
const APP_URL                   = process.env.VITE_APP_URL                 || ''

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { code, state } = req.body || {}

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // ── 1 & 2. Validate state + retrieve code_verifier from sso_state ────────
    const { data: stateRows, error: stateError } = await supabaseAdmin
      .from('sso_state')
      .select('state, code_verifier, expires_at')
      .eq('state', state)
      .single()

    if (stateError || !stateRows) {
      console.error('[entra-callback] State lookup failed:', stateError?.message)
      return res.status(400).json({
        error: 'Invalid or expired SSO state. Please try signing in again.',
      })
    }

    // Check expiry
    if (new Date(stateRows.expires_at) < new Date()) {
      // Cleanup expired row
      await supabaseAdmin.from('sso_state').delete().eq('state', state)
      return res.status(400).json({
        error: 'Sign-in session expired (took more than 10 minutes). Please try again.',
      })
    }

    // ── 3. Delete used state (one-time use) ───────────────────────────────────
    await supabaseAdmin.from('sso_state').delete().eq('state', state)

    const codeVerifier = stateRows.code_verifier

    // ── 4. Read credentials + exchange code for tokens ────────────────────────
    const creds = await readEntraCredentials()

    const tokens = await exchangeCodeForTokens(
      creds.tenantId,
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri,
      code,
      codeVerifier,
    )

    // ── 5. Validate ID token ──────────────────────────────────────────────────
    const claims = await validateIdToken(tokens.id_token, creds.tenantId, creds.clientId)

    // ── 6. Extract user info from claims ──────────────────────────────────────
    const microsoftUser = extractUserFromClaims(claims)
    console.info(`[entra-callback] Authenticated Microsoft user: ${microsoftUser.email} (oid: ${microsoftUser.azureObjectId})`)

    // ── 7. Provision the Supabase user ────────────────────────────────────────
    // Try to create the user. If they already exist, Supabase returns an error
    // with code "email_exists" — we ignore that specific error and proceed.
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email:            microsoftUser.email,
      email_confirm:    true,  // no email verification needed — Microsoft already verified
      user_metadata: {
        full_name:       microsoftUser.displayName,
        azure_object_id: microsoftUser.azureObjectId,
        azure_tenant_id: microsoftUser.tenantId,
        sso_provider:    'entra',
      },
    })

    if (createError && !createError.message.includes('already been registered')) {
      console.error('[entra-callback] createUser error:', createError.message)
      throw new Error(`Failed to provision user account: ${createError.message}`)
    }

    // Ensure the profiles row exists (in case the trigger didn't fire or user pre-existed)
    // Look up the user by email to get their Supabase UUID
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) throw new Error(`Failed to look up user: ${listError.message}`)

    const supabaseUser = users.find(u => u.email?.toLowerCase() === microsoftUser.email.toLowerCase())
    if (!supabaseUser) throw new Error(`Could not find provisioned user: ${microsoftUser.email}`)

    // Update user metadata (name may have changed) and ensure sso_provider is set
    await supabaseAdmin.auth.admin.updateUser(supabaseUser.id, {
      user_metadata: {
        full_name:       microsoftUser.displayName,
        azure_object_id: microsoftUser.azureObjectId,
        sso_provider:    'entra',
      },
    })

    // ── 8. Generate a Supabase magic-link token ───────────────────────────────
    // This is identical to the approach already used by forgot-password.ts.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type:    'magiclink',
      email:   microsoftUser.email,
      options: { redirectTo: APP_URL || undefined },
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[entra-callback] generateLink error:', linkError?.message)
      throw new Error('Failed to generate sign-in token')
    }

    // ── 9. Return hashed_token + type to client ───────────────────────────────
    return res.status(200).json({
      token_hash: linkData.properties.hashed_token,
      type:       'email',
    })

  } catch (err: any) {
    console.error('[entra-callback] Unhandled error:', err.message)
    return res.status(500).json({
      error: err.message || 'Microsoft sign-in failed. Please try again.',
    })
  }
}
