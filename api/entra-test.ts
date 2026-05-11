/**
 * api/entra-test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/entra-test
 * Authorization: Bearer <supabase_access_token>   (admin role required)
 *
 * Tests the stored Entra ID credentials without triggering a user login.
 * Verifies:
 *   1. All required settings are present and the secret can be decrypted.
 *   2. The OpenID Connect discovery document is reachable at Microsoft.
 *   3. The tenant ID and client ID are structurally valid.
 *
 * This does NOT make an OAuth call (that would require a redirect).
 * It validates that the configuration is complete and the tenant is reachable.
 *
 * Response: { success: true, tenantId, clientId, issuer, jwksUri }
 * Error:    { error: string, details?: string }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { requireAuth } from './lib/requireAuth'
import { readEntraCredentials } from './lib/entraSettings'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL              = process.env.VITE_SUPABASE_URL          || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY  || ''

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Require admin role
  const auth = await requireAuth(req, res)
  if (!auth) return

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', auth.userId).single()

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }

  // ── Test 1: credentials are readable + secret decryptable ────────────────
  let creds: Awaited<ReturnType<typeof readEntraCredentials>>
  try {
    creds = await readEntraCredentials()
  } catch (err: any) {
    return res.status(400).json({
      error: 'Configuration incomplete',
      details: err.message,
    })
  }

  // ── Test 2: Tenant's OIDC discovery document is reachable ────────────────
  const discoveryUrl = `https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/v2.0/.well-known/openid-configuration`

  let discoveryDoc: any
  try {
    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(8000),  // 8s timeout
    })
    if (!response.ok) {
      return res.status(400).json({
        error: 'Could not reach Microsoft authentication service',
        details: `Discovery endpoint returned HTTP ${response.status} for tenant "${creds.tenantId}". ` +
                 `Verify the Tenant ID is correct.`,
      })
    }
    discoveryDoc = await response.json()
  } catch (err: any) {
    return res.status(400).json({
      error: 'Network error reaching Microsoft',
      details: err.message,
    })
  }

  // ── Test 3: Client ID looks like a valid UUID ─────────────────────────────
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clientIdValid = uuidPattern.test(creds.clientId)

  return res.status(200).json({
    success:      true,
    tenantId:     creds.tenantId,
    clientId:     creds.clientId,
    clientIdLooksValid: clientIdValid,
    redirectUri:  creds.redirectUri,
    // From the discovery doc:
    issuer:       discoveryDoc.issuer,
    jwksUri:      discoveryDoc.jwks_uri,
    tokenEndpoint: discoveryDoc.token_endpoint,
    message:      'Configuration is valid and Microsoft tenant is reachable.',
  })
}
