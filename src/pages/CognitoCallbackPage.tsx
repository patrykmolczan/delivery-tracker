import React, { useEffect, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { COGNITO_CONFIG } from '../lib/cognitoAuth'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * CognitoCallbackPage
 * Handles the OAuth 2.0 authorization code callback from Cognito hosted UI.
 * Route: /auth/callback
 *
 * Flow:
 *   1. Cognito redirects here with ?code=...
 *   2. POST to Cognito token endpoint → exchange code for Cognito tokens
 *   3. Store Cognito tokens in localStorage (for Cognito SDK)
 *   4. POST to Lambda /api/auth/cognito-exchange with the ID token
 *   5. Lambda generates a Supabase magic-link token (no email sent)
 *   6. Call supabase.auth.verifyOtp() to create a real Supabase session
 *   7. window.location.replace('/') → AuthContext picks up the session
 */
const CognitoCallbackPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Completing sign-in…')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errorParam = params.get('error')
    const errorDesc = params.get('error_description')

    if (errorParam) {
      setError(errorDesc ? decodeURIComponent(errorDesc) : errorParam)
      return
    }

    if (!code) {
      setError('No authorization code received from identity provider.')
      return
    }

    const exchange = async () => {
      try {
        // ── Step 1: Exchange code for Cognito tokens ───────────────────────
        setStatus('Exchanging authorization code…')

        const redirectUri = `${window.location.origin}/auth/callback`
        const tokenEndpoint =
          'https://delivery-tracker-auth.auth.us-east-2.amazoncognito.com/oauth2/token'

        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: COGNITO_CONFIG.ClientId,
          code,
          redirect_uri: redirectUri,
        })

        const res = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Token exchange failed: ${text}`)
        }

        const tokens = await res.json()
        const { id_token, access_token, refresh_token } = tokens

        if (!id_token || !access_token) {
          throw new Error('Incomplete token response from Cognito.')
        }

        // Parse ID token payload (base64url decode middle segment)
        const payloadB64 = id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const idPayload = JSON.parse(atob(payloadB64))

        // Cognito SDK uses cognito:username as the localStorage key
        const username = idPayload['cognito:username'] || idPayload.sub

        setStatus('Setting up Cognito session…')

        // Write tokens in the exact format amazon-cognito-identity-js expects
        const prefix = `CognitoIdentityServiceProvider.${COGNITO_CONFIG.ClientId}`
        localStorage.setItem(`${prefix}.LastAuthUser`, username)
        localStorage.setItem(`${prefix}.${username}.idToken`, id_token)
        localStorage.setItem(`${prefix}.${username}.accessToken`, access_token)
        if (refresh_token) {
          localStorage.setItem(`${prefix}.${username}.refreshToken`, refresh_token)
        }
        localStorage.setItem(`${prefix}.${username}.clockDrift`, '0')

        // ── Step 2: Bridge — create Supabase session ───────────────────────
        setStatus('Creating secure session…')

        const bridgeRes = await fetch(`${API_BASE}/api/auth/cognito-exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: id_token }),
        })

        if (!bridgeRes.ok) {
          const errText = await bridgeRes.text()
          throw new Error(`Session bridge failed (${bridgeRes.status}): ${errText}`)
        }

        const { email, hashed_token } = await bridgeRes.json()

        if (!email || !hashed_token) {
          throw new Error('Invalid bridge response — missing email or token.')
        }

        // ── Step 3: Verify OTP to create Supabase session ─────────────────
        setStatus('Signing in…')

        const { error: otpError } = await supabase.auth.verifyOtp({
          email,
          token: hashed_token,
          type: 'magiclink',
        })

        if (otpError) {
          throw new Error(`Supabase session error: ${otpError.message}`)
        }

        setStatus('Redirecting…')
        // Replace history so Back button doesn't return to /auth/callback
        window.location.replace('/')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      }
    }

    exchange()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center p-4">
        <div className="card bg-base-200 shadow-xl max-w-md w-full">
          <div className="card-body items-center text-center gap-4">
            <AlertCircle size={40} className="text-error" />
            <h2 className="card-title text-error">Sign-in Failed</h2>
            <p className="text-base-content/60 text-sm">{error}</p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => window.location.replace('/')}
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={40} className="text-primary animate-spin" />
        <p className="text-base-content/50 text-sm">{status}</p>
      </div>
    </div>
  )
}

export { CognitoCallbackPage }
