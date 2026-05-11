/**
 * src/hooks/useEntraSSO.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook for the Microsoft Entra ID SSO login flow on the LoginPage.
 *
 * Flow:
 *   1. On mount, loads `sso_provider` + `sso_enabled` from app_settings.
 *   2. When `triggerSignIn()` is called:
 *        a. POSTs to GET /api/entra-login (server reads credentials from DB,
 *           generates PKCE state, returns Microsoft authorization URL).
 *        b. Redirects the browser to that URL.
 *   3. Microsoft redirects the user to /auth/entra/callback, which is handled
 *      by EntraCallbackPage — no further action needed from this hook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react'
import { fetchAppSettings } from '../lib/data'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SSOProvider = 'entra' | 'okta' | 'none'

export interface EntraDisplaySettings {
  /** Which SSO provider is configured */
  provider:   SSOProvider
  /** Whether SSO is the primary login method */
  ssoEnabled: boolean
  /** Optional display hint e.g. "magnitglobal.com" */
  tenantHint: string
}

interface UseEntraSSOReturn {
  entraSettings:  EntraDisplaySettings
  settingsLoaded: boolean
  loading:        boolean
  error:          string | null
  clearError:     () => void
  triggerSignIn:  () => Promise<void>
}

const DEFAULT: EntraDisplaySettings = { provider: 'none', ssoEnabled: false, tenantHint: '' }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEntraSSO(): UseEntraSSOReturn {
  const [entraSettings,  setEntraSettings]  = useState<EntraDisplaySettings>(DEFAULT)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  // Load provider flag from app_settings on mount
  useEffect(() => {
    let cancelled = false
    fetchAppSettings()
      .then(raw => {
        if (cancelled) return
        const rawProvider = raw['sso_provider'] ?? 'none'
        const provider: SSOProvider =
          rawProvider === 'entra' ? 'entra' :
          rawProvider === 'okta'  ? 'okta'  : 'none'
        setEntraSettings({
          provider,
          ssoEnabled: raw['sso_enabled'] === 'true',
          tenantHint: raw['entra_tenant_hint'] ?? '',
        })
      })
      .catch(() => { /* non-fatal — SSO won't show */ })
      .finally(() => { if (!cancelled) setSettingsLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const triggerSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      // Ask our backend for the Microsoft authorization URL.
      // The server reads credentials from DB, generates PKCE, stores state.
      const res  = await fetch('/api/entra-login')
      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to initiate Microsoft sign-in')
      }

      // Redirect the browser to Microsoft's authorization endpoint.
      // The browser will navigate away — execution stops here on success.
      window.location.href = data.authorizationUrl
      // (loading stays true until the redirect completes)
    } catch (e: any) {
      setError(e.message ?? 'Could not connect to the authentication server')
      setLoading(false)
    }
  }

  return {
    entraSettings,
    settingsLoaded,
    loading,
    error,
    clearError: () => setError(null),
    triggerSignIn,
  }
}
