/**
 * src/pages/EntraCallbackPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the OAuth callback redirect from Microsoft Entra ID.
 *
 * Microsoft redirects here after the user authenticates:
 *   GET /auth/entra/callback?code=<auth_code>&state=<state>
 *
 * This page:
 *   1. Reads `code` and `state` from the URL.
 *   2. Posts them to /api/entra-callback.
 *   3. Gets back { token_hash, type } (a Supabase magic-link token).
 *   4. Calls supabase.auth.verifyOtp({ token_hash, type }) to exchange for a session.
 *   5. On success: clears the URL params and navigates to /.
 *   6. On error: shows an error message with a retry button.
 *
 * Error states handled:
 *   • Microsoft returned an error (e.g. user cancelled, access denied)
 *   • Expired or replayed state (CSRF / replay attack)
 *   • Token exchange failure (misconfiguration)
 *   • Supabase verifyOtp failure
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Stage =
  | 'exchanging'   // calling /api/entra-callback
  | 'verifying'    // calling supabase.auth.verifyOtp
  | 'success'      // redirecting to /
  | 'error'        // something went wrong

export const EntraCallbackPage: React.FC = () => {
  const [stage, setStage] = useState<Stage>('exchanging')
  const [errorMsg, setErrorMsg] = useState('')
  const hasRun = useRef(false)  // prevent double-fire in React StrictMode

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    void handleCallback()
  }, [])

  const handleCallback = async () => {
    const params = new URLSearchParams(window.location.search)

    // ── Check for Microsoft error response ────────────────────────────────
    const msError = params.get('error')
    if (msError) {
      const desc = params.get('error_description') ?? msError
      if (msError === 'access_denied') {
        setErrorMsg('Sign-in was cancelled. Click below to try again.')
      } else {
        setErrorMsg(`Microsoft returned an error: ${decodeURIComponent(desc)}`)
      }
      setStage('error')
      return
    }

    const code  = params.get('code')
    const state = params.get('state')

    if (!code || !state) {
      setErrorMsg('Invalid callback URL — missing authorization code or state. Please try signing in again.')
      setStage('error')
      return
    }

    // Clear the URL immediately (security — remove auth code from browser history)
    window.history.replaceState({}, '', window.location.pathname)

    // ── Exchange code for Supabase token via our serverless function ──────
    let tokenHash: string
    let tokenType: string

    try {
      const res = await fetch('/api/entra-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Sign-in failed. Please try again.')
      }

      tokenHash = data.token_hash
      tokenType = data.type
    } catch (e: any) {
      setErrorMsg(e.message)
      setStage('error')
      return
    }

    // ── Exchange Supabase token for a session ─────────────────────────────
    setStage('verifying')

    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type:       tokenType as any,
    })

    if (otpError) {
      setErrorMsg(`Session creation failed: ${otpError.message}. Please try signing in again.`)
      setStage('error')
      return
    }

    // ── Success — onAuthStateChange(SIGNED_IN) will fire, App will render Dashboard ──
    setStage('success')
    // Hard redirect clears any leftover URL state
    window.location.href = '/'
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--fallback-b1, oklch(var(--b1)))',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: 'var(--fallback-b1, oklch(var(--b1)))',
          border: '1px solid var(--fallback-b3, oklch(var(--b3)))',
          borderRadius: 12,
          padding: '40px 32px',
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {/* Microsoft logo */}
        <svg width={32} height={32} viewBox="0 0 21 21" style={{ margin: '0 auto 16px' }}>
          <rect x="0"  y="0"  width="10" height="10" fill="#F25022" />
          <rect x="11" y="0"  width="10" height="10" fill="#7FBA00" />
          <rect x="0"  y="11" width="10" height="10" fill="#00A4EF" />
          <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
        </svg>

        {stage === 'exchanging' && (
          <>
            <Loader2 size={28} className="animate-spin text-primary mx-auto mb-3" />
            <p className="font-semibold text-base-content mb-1">Completing sign-in…</p>
            <p className="text-sm text-base-content/50">Verifying your Microsoft account</p>
          </>
        )}

        {stage === 'verifying' && (
          <>
            <Loader2 size={28} className="animate-spin text-primary mx-auto mb-3" />
            <p className="font-semibold text-base-content mb-1">Almost there…</p>
            <p className="text-sm text-base-content/50">Creating your session</p>
          </>
        )}

        {stage === 'success' && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
            <p className="font-semibold text-base-content mb-1 text-success">Signed in!</p>
            <p className="text-sm text-base-content/50">Redirecting…</p>
          </>
        )}

        {stage === 'error' && (
          <>
            <AlertTriangle size={28} className="text-error mx-auto mb-3" />
            <p className="font-semibold text-base-content mb-2">Sign-in failed</p>
            <p className="text-sm text-base-content/60 mb-6 leading-relaxed">{errorMsg}</p>
            <button
              className="btn btn-primary btn-sm gap-2"
              onClick={() => { window.location.href = '/' }}
            >
              <RefreshCw size={14} />
              Return to login
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default EntraCallbackPage
