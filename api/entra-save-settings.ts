/**
 * api/entra-save-settings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/entra-save-settings
 * Authorization: Bearer <supabase_access_token>   (admin or super_admin role required)
 *
 * Saves all Microsoft Entra ID OIDC configuration to app_settings.
 * The client secret is encrypted with AES-256-GCM before storage.
 *
 * Body:
 * {
 *   ssoEnabled:      boolean
 *   tenantId:        string   // Azure Tenant ID (GUID or domain)
 *   clientId:        string   // Azure Application (client) ID
 *   clientSecret:    string   // Plaintext — encrypted here, never stored raw
 *   redirectUri:     string   // The /auth/entra/callback URL
 *   tenantHint:      string   // Display label (optional)
 * }
 *
 * If clientSecret is an empty string, the existing encrypted secret is preserved
 * (allows the admin to update other fields without re-entering the secret).
 *
 * Response: { success: true }
 * Error:    { error: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { requireAuth } from './lib/requireAuth'
import { encryptSecret, upsertSetting, readEntraSettings } from './lib/entraSettings'

const SUPABASE_URL              = process.env.VITE_SUPABASE_URL          || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY  || ''

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Authenticate + authorise (admin/super_admin only) ─────────────────────
  const auth = await requireAuth(req, res)
  if (!auth) return  // requireAuth already sent 401

  // Check the caller is an admin
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', auth.userId)
    .single()

  if (profileError || !profile) {
    return res.status(403).json({ error: 'Could not verify user role' })
  }

  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin role required to modify SSO settings' })
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  const {
    ssoEnabled,
    tenantId,
    clientId,
    clientSecret,  // may be '' if not being changed
    redirectUri,
    tenantHint = '',
  } = req.body || {}

  if (typeof ssoEnabled !== 'boolean') {
    return res.status(400).json({ error: 'ssoEnabled must be a boolean' })
  }
  if (!tenantId?.trim())   return res.status(400).json({ error: 'tenantId is required' })
  if (!clientId?.trim())   return res.status(400).json({ error: 'clientId is required' })
  if (!redirectUri?.trim()) return res.status(400).json({ error: 'redirectUri is required' })

  // ── Determine the secret to store ────────────────────────────────────────
  let secretToStore: string

  if (clientSecret && clientSecret.trim().length > 0) {
    // New secret provided — encrypt it
    secretToStore = encryptSecret(clientSecret.trim())
  } else {
    // No new secret — preserve the existing encrypted value
    try {
      const existing = await readEntraSettings()
      if (!existing.clientSecretEnc) {
        return res.status(400).json({
          error: 'Client Secret is required (no existing secret stored)',
        })
      }
      secretToStore = existing.clientSecretEnc
    } catch {
      return res.status(400).json({
        error: 'Client Secret is required',
      })
    }
  }

  // ── Save all settings ─────────────────────────────────────────────────────
  try {
    await upsertSetting('sso_enabled',             ssoEnabled ? 'true' : 'false')
    await upsertSetting('sso_provider',            'entra')
    await upsertSetting('entra_tenant_id',         tenantId.trim())
    await upsertSetting('entra_client_id',         clientId.trim())
    await upsertSetting('entra_client_secret_enc', secretToStore)
    await upsertSetting('entra_redirect_uri',      redirectUri.trim())
    await upsertSetting('entra_tenant_hint',       tenantHint.trim())

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('[entra-save-settings] Error:', err.message)
    return res.status(500).json({ error: err.message || 'Failed to save settings' })
  }
}
