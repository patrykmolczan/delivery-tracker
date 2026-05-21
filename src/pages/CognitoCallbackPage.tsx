import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { COGNITO_CONFIG } from '../lib/cognitoAuth'
import { useLogo } from '../hooks/useLogo'

/**
 * CognitoCallbackPage
 * Handles the OAuth 2.0 authorization code callback from Cognito hosted UI.
 * Route: /auth/callback
 *
 * Flow:
 *   1. Cognito redirects here with ?code=...
 *   2. POST to Cognito token endpoint → exchange code for Cognito tokens
 *   3. Store tokens in localStorage (amazon-cognito-identity-js format)
 *   4. window.location.replace('/') → AuthContext detects Cognito session via getSession()
 *      and loads the user profile from Lambda /api/me — no Supabase session created.
 */

/* ── Keyframes injected once ── */
const KF_ID = 'cb-aurora-kf'
const KF_CSS = `
@keyframes cb-drift1{0%{transform:translate(0,0) scale(1)}33%{transform:translate(14px,10px) scale(1.05)}66%{transform:translate(8px,20px) scale(0.97)}100%{transform:translate(0,0) scale(1)}}
@keyframes cb-drift2{0%{transform:translate(0,0) scale(1)}40%{transform:translate(-12px,-16px) scale(1.08)}70%{transform:translate(6px,-8px) scale(0.95)}100%{transform:translate(0,0) scale(1)}}
@keyframes cb-drift3{0%{transform:translate(0,0) scale(1);opacity:0.25}50%{transform:translate(-10px,12px) scale(1.1);opacity:0.35}100%{transform:translate(0,0) scale(1);opacity:0.25}}
@keyframes cb-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.55)}}
@keyframes cb-scan{0%{transform:translateY(-100%);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(200%);opacity:0}}
@keyframes cb-fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes cb-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes cb-check-pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.25);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes cb-progress-glow{0%,100%{box-shadow:0 0 6px rgba(34,211,238,0.4)}50%{box-shadow:0 0 14px rgba(34,211,238,0.7)}}
`

const STEPS = [
  { id: 0, label: 'Connecting to identity provider', detail: 'Establishing secure channel…' },
  { id: 1, label: 'Verifying your identity',         detail: 'Validating credentials with Microsoft Entra…' },
  { id: 2, label: 'Securing your session',           detail: 'Storing encrypted tokens…' },
  { id: 3, label: 'Loading your workspace',          detail: 'Almost there…' },
]

const CognitoCallbackPage: React.FC = () => {
  const [error, setError]   = useState<string | null>(null)
  const [step,  setStep]    = useState(0)
  const [fading, setFading] = useState(false)
  const { logoUrl }         = useLogo()

  /* Inject aurora keyframes once */
  useEffect(() => {
    if (document.getElementById(KF_ID)) return
    const el = document.createElement('style')
    el.id = KF_ID
    el.textContent = KF_CSS
    document.head.appendChild(el)
  }, [])

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
    const code      = params.get('code')
    const errorParam = params.get('error')
    const errorDesc  = params.get('error_description')

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
        // ── Step 1: Exchange code for Cognito tokens ──────────────────────
        setStep(1)

        const redirectUri   = `${window.location.origin}/auth/callback`
        const tokenEndpoint = 'https://delivery-tracker-auth.auth.us-east-2.amazoncognito.com/oauth2/token'

        const body = new URLSearchParams({
          grant_type:   'authorization_code',
          client_id:    COGNITO_CONFIG.ClientId,
          code,
          redirect_uri: redirectUri,
        })

        const res = await fetch(tokenEndpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
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
        const idPayload  = JSON.parse(atob(payloadB64))

        // Cognito SDK uses cognito:username as the localStorage key
        const username = idPayload['cognito:username'] || idPayload.sub

        // ── Step 2: Write tokens in amazon-cognito-identity-js format ─────
        setStep(2)

        const prefix = `CognitoIdentityServiceProvider.${COGNITO_CONFIG.ClientId}`
        localStorage.setItem(`${prefix}.LastAuthUser`,          username)
        localStorage.setItem(`${prefix}.${username}.idToken`,   id_token)
        localStorage.setItem(`${prefix}.${username}.accessToken`, access_token)
        if (refresh_token) {
          localStorage.setItem(`${prefix}.${username}.refreshToken`, refresh_token)
        }
        localStorage.setItem(`${prefix}.${username}.clockDrift`, '0')

        // ── Step 3: Pause so user can appreciate the completed screen ─────
        setStep(3)
        await new Promise(r => setTimeout(r, 1500))

        // Fade out, then replace history so Back button doesn't return to /auth/callback
        setFading(true)
        await new Promise(r => setTimeout(r, 580))
        window.location.replace('/')
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      }
    }

    exchange()
  }, [])

  /* ── Error state ── */
  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #060b18 0%, #0a1628 45%, #0b1e3a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 16, padding: '32px 36px',
          maxWidth: 440, width: '100%', textAlign: 'center',
          backdropFilter: 'blur(20px)',
        }}>
          <AlertCircle size={40} style={{ color: '#f87171', margin: '0 auto 16px' }} />
          <h2 style={{ color: '#fca5a5', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Sign-in Failed
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            {error}
          </p>
          <button
            style={{
              padding: '9px 24px',
              background: 'linear-gradient(135deg, #0ea5e9, #0d9488)',
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
            onClick={() => window.location.replace('/')}
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  /* ── Loading state ── */
  const progressPct = (step / (STEPS.length - 1)) * 100

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #060b18 0%, #0a1628 45%, #0b1e3a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      /* Fade-to-black before dashboard appears */
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.58s ease',
    }}>

      {/* ── Aurora blobs ── */}
      <div style={{
        position: 'absolute', width: 560, height: 560, borderRadius: '50%',
        filter: 'blur(120px)',
        background: 'radial-gradient(circle, rgba(14,165,233,0.16) 0%, transparent 70%)',
        top: -180, left: -180, pointerEvents: 'none',
        animation: 'cb-drift1 14s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: 420, height: 420, borderRadius: '50%',
        filter: 'blur(100px)',
        background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 70%)',
        bottom: -120, right: -120, pointerEvents: 'none',
        animation: 'cb-drift2 16s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300, borderRadius: '50%',
        filter: 'blur(80px)',
        background: 'radial-gradient(circle, rgba(13,148,136,0.1) 0%, transparent 70%)',
        top: '45%', left: '52%', pointerEvents: 'none',
        animation: 'cb-drift3 11s ease-in-out infinite',
      }} />

      {/* ── Dot grid overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: [
          'linear-gradient(rgba(99,179,237,0.06) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(99,179,237,0.06) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '28px 28px',
      }} />

      {/* ── Scan line ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 200,
        background: 'linear-gradient(to bottom, transparent, rgba(6,182,212,0.04) 50%, transparent)',
        animation: 'cb-scan 8s linear infinite', pointerEvents: 'none',
      }} />

      {/* ── Main glassmorphism card ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        background: 'rgba(255,255,255,0.033)',
        border: '1px solid rgba(14,165,233,0.16)',
        borderRadius: 20, padding: '40px 44px',
        width: '100%', maxWidth: 420,
        backdropFilter: 'blur(28px)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.52), 0 0 0 1px rgba(14,165,233,0.07)',
        animation: 'cb-fadeUp 0.48s ease both',
      }}>

        {/* Logo */}
        {logoUrl && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              borderRadius: 10, padding: '7px 16px',
              display: 'inline-flex', alignItems: 'center',
            }}>
              <img
                src={logoUrl}
                alt="Logo"
                style={{ height: 36, width: 'auto', display: 'block', maxWidth: 180 }}
              />
            </div>
          </div>
        )}

        {/* Spinner + headline */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          {/* Concentric ring spinner */}
          <div style={{
            width: 58, height: 58, margin: '0 auto 20px',
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Outer static ring */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(14,165,233,0.12)',
            }} />
            {/* Spinning arc */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: '#22d3ee',
              borderRightColor: 'rgba(34,211,238,0.35)',
              animation: 'cb-spin 0.9s linear infinite',
            }} />
            {/* Inner glow dot */}
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: '#22d3ee',
              boxShadow: '0 0 14px rgba(34,211,238,0.85)',
              animation: 'cb-pulse 1.6s infinite',
            }} />
          </div>

          <div style={{
            fontSize: 19, fontWeight: 700, color: '#f0f8ff',
            marginBottom: 7, letterSpacing: '-0.3px',
          }}>
            Signing you in
          </div>
          <div style={{
            fontSize: 13, color: 'rgba(180,210,255,0.5)',
            lineHeight: 1.55, minHeight: 20,
            transition: 'opacity 0.3s',
          }}>
            {STEPS[step]?.detail}
          </div>
        </div>

        {/* Step list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
          {STEPS.map((s, i) => {
            const done   = step > i
            const active = step === i
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  opacity: i > step ? 0.28 : 1,
                  transition: 'opacity 0.45s ease',
                }}
              >
                {/* State icon */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: done
                    ? '1.5px solid #34d399'
                    : active
                    ? '1.5px solid #22d3ee'
                    : '1.5px solid rgba(255,255,255,0.13)',
                  background: done
                    ? 'rgba(52,211,153,0.12)'
                    : active
                    ? 'rgba(34,211,238,0.1)'
                    : 'transparent',
                  transition: 'all 0.4s ease',
                  boxShadow: active ? '0 0 10px rgba(34,211,238,0.28)' : 'none',
                }}>
                  {done ? (
                    <CheckCircle2
                      size={14}
                      style={{ color: '#34d399', animation: 'cb-check-pop 0.32s ease both' }}
                    />
                  ) : active ? (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#22d3ee',
                      animation: 'cb-pulse 1s infinite',
                    }} />
                  ) : (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.18)',
                    }} />
                  )}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  color: done
                    ? '#34d399'
                    : active
                    ? '#e4efff'
                    : 'rgba(255,255,255,0.28)',
                  transition: 'color 0.4s ease',
                  letterSpacing: '0.01em',
                }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div style={{
          height: 3, borderRadius: 2,
          background: 'rgba(14,165,233,0.1)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, #22d3ee, #2dd4bf)',
            width: `${progressPct}%`,
            transition: 'width 0.85s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 10px rgba(34,211,238,0.55)',
            animation: 'cb-progress-glow 2s ease-in-out infinite',
          }} />
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center', marginTop: 20,
          fontSize: 11, color: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
            background: 'rgba(14,165,233,0.5)',
            boxShadow: '0 0 5px rgba(14,165,233,0.5)',
          }} />
          Secure · Enterprise-ready
        </div>
      </div>
    </div>
  )
}

export { CognitoCallbackPage }
