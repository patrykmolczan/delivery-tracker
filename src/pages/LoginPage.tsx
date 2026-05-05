import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, AlertCircle, KeyRound, ArrowRight } from 'lucide-react'
import { useLogo } from '../hooks/useLogo'
import { useTheme } from '../contexts/ThemeContext'
import { fetchAppSettings } from '../lib/data'

export const LoginPage: React.FC = () => {
  const { signIn, signInWithSSO } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { logoUrl, loginIconUrl } = useLogo()
  const { isDark } = useTheme()

  // SSO settings — loaded from app_settings table on mount
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoDomain, setSsoDomain] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  useEffect(() => {
    fetchAppSettings()
      .then(s => {
        setSsoEnabled(s.sso_enabled === 'true')
        setSsoDomain(s.sso_domain || '')
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleSSOSignIn = async () => {
    setError(null)
    if (!ssoDomain) {
      setError('SSO domain not configured — contact your administrator.')
      return
    }
    setLoading(true)
    const { error } = await signInWithSSO(ssoDomain)
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setForgotError('Enter your email address above first.'); return }
    setForgotLoading(true)
    setForgotError(null)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForgotError(data.error || 'Failed to send reset email. Please try again.')
      } else {
        setForgotSent(true)
      }
    } catch {
      setForgotError('Network error. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  const showSSO = ssoEnabled && settingsLoaded && !showPasswordFallback
  const showPassword = !ssoEnabled || showPasswordFallback

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-6" style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      <div className="flex flex-col lg:flex-row" style={{ width: '100%', maxWidth: 900, minHeight: 560, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid var(--fallback-bc,oklch(var(--bc)/0.1))' }}>

      {/* ── Mobile header (navy, shown only on mobile) ───────────────── */}
      <div className="flex lg:hidden flex-col items-center" style={{ background: '#0C447C', padding: '28px 24px 24px', position: 'relative' }}>
        {loginIconUrl && (
          <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
            <img src={loginIconUrl} alt="Login Icon" style={{ maxHeight: 32, maxWidth: 32, objectFit: 'contain', display: 'block' }} />
          </div>
        )}

        {/* Mini pipeline */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 16 }}>
          {/* Node 01 */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#185FA5', border: '1px solid #378ADD', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.55)', fontFamily: 'sans-serif', lineHeight: 1 }}>INTAKE</span>
            <span style={{ fontSize: 8, color: 'white', fontFamily: 'sans-serif', fontWeight: 500 }}>01</span>
          </div>
          <div style={{ width: 20, height: 1, background: '#5DCAA5' }} />
          {/* Node 02 — active + pulse */}
          <div style={{ position: 'relative', width: 36, height: 36 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#185FA5', border: '1px solid #378ADD', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.55)', fontFamily: 'sans-serif', lineHeight: 1 }}>PROC</span>
              <span style={{ fontSize: 8, color: 'white', fontFamily: 'sans-serif', fontWeight: 500 }}>02</span>
            </div>
            {!loading && (
              <svg style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', overflow: 'visible', pointerEvents: 'none' }} width="36" height="36">
                <circle cx="18" cy="18" r="18" fill="none" stroke="#5DCAA5" strokeWidth="1" opacity="0.5">
                  <animate attributeName="r" values="18;26;18" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" repeatCount="indefinite" />
                </circle>
              </svg>
            )}
          </div>
          <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.2)' }} />
          {/* Node 03 */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 6, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif', lineHeight: 1 }}>REVIEW</span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif', fontWeight: 500 }}>03</span>
          </div>
          <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.2)' }} />
          {/* Node 04 — done green */}
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#085041', border: '1px solid #1D9E75', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 6, color: 'rgba(157,225,203,0.7)', fontFamily: 'sans-serif', lineHeight: 1 }}>DONE</span>
            <span style={{ fontSize: 8, color: '#9FE1CB', fontFamily: 'sans-serif', fontWeight: 500 }}>04</span>
          </div>
        </div>
        {/* Analyst avatars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          {[['PH','#185FA5'],['PM','#0F6E56'],['AA','#185FA5'],['KT','#0F6E56'],['MC','#185FA5']].map(([init, bg]) => (
            <div key={init} style={{ width: 24, height: 24, borderRadius: '50%', background: bg, border: '1.5px solid #0C447C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'white', fontFamily: 'sans-serif' }}>{init}</div>
          ))}
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>5 analysts · live</span>
        </div>
        {/* Tag */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 100, padding: '3px 10px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#5DCAA5' }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>Magnit Global · Internal Platform</span>
        </div>
      </div>

      {/* ── Left panel (desktop only) ─────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 overflow-hidden relative"
        style={{ background: '#0C447C', padding: '48px 40px', minWidth: 0 }}
      >
        {loginIconUrl && (
          <div style={{ position: 'absolute', top: 24, right: 28, zIndex: 1 }}>
            <img src={loginIconUrl} alt="Login Icon" style={{ maxHeight: 40, maxWidth: 40, objectFit: 'contain', display: 'block' }} />
          </div>
        )}

        {/* Tag pill */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: 100, padding: '5px 14px',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5DCAA5', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.02em' }}>
              Magnit Global · Internal Platform
            </span>
          </div>

          <h2 style={{ fontSize: 28, fontWeight: 500, color: '#fff', lineHeight: 1.3, marginTop: 20 }}>
            Your delivery<br />pipeline, unified.
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 10, lineHeight: 1.6 }}>
            Track every project, analyst,<br />and deadline — from intake to delivery.
          </p>
        </div>

        {/* Pipeline graphic */}
        <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', margin: '8px 0' }}>
          <defs>
            <marker id="arr-teal" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#5DCAA5" />
            </marker>
          </defs>

          {/* Track glow */}
          <path d="M30,110 C80,110 80,60 130,60 C180,60 180,160 230,160 C265,160 280,130 295,110"
            stroke="rgba(255,255,255,0.08)" strokeWidth="28" fill="none" strokeLinecap="round" />
          {/* Dashed spine */}
          <path d="M30,110 C80,110 80,60 130,60 C180,60 180,160 230,160 C265,160 280,130 295,110"
            stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="4 4" />
          {/* Active teal segment */}
          <path d="M30,110 C80,110 80,60 130,60 C155,60 168,90 175,115"
            stroke="#5DCAA5" strokeWidth="2" fill="none" strokeLinecap="round" markerEnd="url(#arr-teal)" />

          {/* Node 01: Intake */}
          <circle cx="30" cy="110" r="18" fill="#185FA5" stroke="#378ADD" strokeWidth="1" />
          <text x="30" y="107" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)" fontFamily="sans-serif">INTAKE</text>
          <text x="30" y="117" textAnchor="middle" fontSize="9" fill="white" fontWeight="500" fontFamily="sans-serif">01</text>

          {/* Node 02: Process (active + pulse) */}
          <circle cx="130" cy="60" r="18" fill="#185FA5" stroke="#378ADD" strokeWidth="1" />
          <text x="130" y="57" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.6)" fontFamily="sans-serif">PROCESS</text>
          <text x="130" y="67" textAnchor="middle" fontSize="9" fill="white" fontWeight="500" fontFamily="sans-serif">02</text>
          {!loading && (
            <circle cx="130" cy="60" r="24" fill="none" stroke="#5DCAA5" strokeWidth="1" opacity="0.5">
              <animate attributeName="r" values="18;28;18" dur="2.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Node 03: Review */}
          <circle cx="230" cy="160" r="18" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
          <text x="230" y="157" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif">REVIEW</text>
          <text x="230" y="167" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.5)" fontWeight="500" fontFamily="sans-serif">03</text>

          {/* Node 04: Done — muted green */}
          <circle cx="295" cy="110" r="18" fill="#085041" stroke="#1D9E75" strokeWidth="1" />
          <text x="295" y="107" textAnchor="middle" fontSize="8" fill="rgba(157,225,203,0.7)" fontFamily="sans-serif">DONE</text>
          <text x="295" y="117" textAnchor="middle" fontSize="9" fill="#9FE1CB" fontWeight="500" fontFamily="sans-serif">04</text>

          {/* Floating card: active */}
          <rect x="52" y="72" width="56" height="28" rx="6" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
          <circle cx="62" cy="82" r="3" fill="#5DCAA5" />
          <rect x="68" y="79" width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.5)" />
          <rect x="68" y="85" width="20" height="2" rx="1" fill="rgba(255,255,255,0.25)" />
          <rect x="52" y="90" width="56" height="1" rx="0.5" fill="rgba(255,255,255,0.05)" />
          <rect x="53" y="91" width="30" height="2" rx="1" fill="#5DCAA5" opacity="0.6" />

          {/* Floating card: queued */}
          <rect x="155" y="100" width="56" height="28" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
          <circle cx="165" cy="110" r="3" fill="rgba(255,255,255,0.3)" />
          <rect x="171" y="107" width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
          <rect x="171" y="113" width="20" height="2" rx="1" fill="rgba(255,255,255,0.15)" />

          {/* 5 analyst avatars */}
          <circle cx="80" cy="188" r="12" fill="#185FA5" stroke="#0C447C" strokeWidth="2" />
          <text x="80" y="192" textAnchor="middle" fontSize="8" fill="white" fontFamily="sans-serif">PH</text>
          <circle cx="108" cy="188" r="12" fill="#0F6E56" stroke="#0C447C" strokeWidth="2" />
          <text x="108" y="192" textAnchor="middle" fontSize="8" fill="white" fontFamily="sans-serif">PM</text>
          <circle cx="136" cy="188" r="12" fill="#185FA5" stroke="#0C447C" strokeWidth="2" />
          <text x="136" y="192" textAnchor="middle" fontSize="8" fill="white" fontFamily="sans-serif">AA</text>
          <circle cx="164" cy="188" r="12" fill="#0F6E56" stroke="#0C447C" strokeWidth="2" />
          <text x="164" y="192" textAnchor="middle" fontSize="8" fill="white" fontFamily="sans-serif">KT</text>
          <circle cx="192" cy="188" r="12" fill="#185FA5" stroke="#0C447C" strokeWidth="2" />
          <text x="192" y="192" textAnchor="middle" fontSize="8" fill="white" fontFamily="sans-serif">MC</text>
          <text x="136" y="213" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">5 analysts · live</text>
        </svg>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
          Secure · Enterprise-ready · Magnit Internal Use Only
        </p>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────── */}
      <div
        className="flex flex-col justify-center w-full lg:w-auto"
        style={{
          background: 'var(--fallback-b1,oklch(var(--b1)))',
          padding: '40px 40px 48px',
          minWidth: 0,
          flex: '0 0 380px',
          position: 'relative',
        }}
      >
        {/* Logo — top right on desktop only (mobile shows it in navy header above) */}
        {logoUrl && (
          <div className="hidden lg:flex" style={{ justifyContent: 'flex-end', marginBottom: 24 }}>
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.92)' : 'var(--fallback-b2,oklch(var(--b2)))',
              border: '0.5px solid var(--fallback-bc,oklch(var(--bc)/0.1))',
              borderRadius: 10,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
            }}>
              <img src={logoUrl} alt="Company Logo" style={{ height: 42, width: 'auto', display: 'block', maxWidth: 220 }} />
            </div>
          </div>
        )}

        {/* Mobile logo — top right of white area, transparent logo sits clean on white */}
        {logoUrl && (
          <div className="flex lg:hidden" style={{ position: 'absolute', top: 16, right: 16 }}>
            <img src={logoUrl} alt="Company Logo" style={{ height: 26, width: 'auto', display: 'block', maxWidth: 130 }} />
          </div>
        )}



        {/* Heading */}
        <div style={{ marginBottom: logoUrl ? 0 : 28 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--fallback-bc,oklch(var(--bc)/0.4))', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Delivery Tracker
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--fallback-bc,oklch(var(--bc)))', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fallback-bc,oklch(var(--bc)/0.6))', marginBottom: 32 }}>
            Sign in to your account to continue
          </p>
        </div>

        {/* ── SSO Mode ────────────────────────────────────────────────── */}
        {showSSO && (
          <div className="space-y-4">
            <button
              type="button"
              className="btn w-full"
              style={{ background: '#0C447C', color: '#fff', border: 'none', height: 40, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              disabled={loading}
              onClick={handleSSOSignIn}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={15} />}
              {loading ? 'Redirecting to Okta…' : 'Sign in with Okta SSO'}
            </button>

            {error && (
              <div className="alert alert-error py-2">
                <AlertCircle size={16} />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div className="text-center">
              <button
                type="button"
                className="text-xs underline underline-offset-2 transition-colors"
                style={{ color: 'var(--fallback-bc,oklch(var(--bc)/0.4))' }}
                onClick={() => { setShowPasswordFallback(true); setError(null) }}
              >
                Sign in with email &amp; password instead
              </button>
            </div>
          </div>
        )}

        {/* ── Password Mode ───────────────────────────────────────────── */}
        {showPassword && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fallback-bc,oklch(var(--bc)/0.6))', marginBottom: 6, letterSpacing: '0.02em' }}>
                Work email
              </label>
              <input
                type="email"
                className="input input-bordered w-full"
                style={{ height: 40, fontSize: 14 }}
                placeholder="you@magnitglobal.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fallback-bc,oklch(var(--bc)/0.6))', marginBottom: 6, letterSpacing: '0.02em' }}>
                Password
              </label>
              <input
                type="password"
                className="input input-bordered w-full"
                style={{ height: 40, fontSize: 14 }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="alert alert-error py-2 mt-2">
                <AlertCircle size={16} />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn w-full mt-4"
              style={{ background: '#0C447C', color: '#fff', border: 'none', height: 40, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              disabled={loading}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight size={14} />}
            </button>

            {/* Forgot password */}
            {!forgotSent ? (
              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                  className="text-xs underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--fallback-bc,oklch(var(--bc)/0.4))' }}
                >
                  {forgotLoading ? 'Sending…' : 'Forgot password?'}
                </button>
                {forgotError && (
                  <p className="text-xs text-error mt-1">{forgotError}</p>
                )}
              </div>
            ) : (
              <div className="alert alert-success py-2 mt-3">
                <span className="text-sm">✓ Password reset email sent — check your inbox.</span>
              </div>
            )}

            {/* SSO option below password form */}
            {!ssoEnabled && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--fallback-bc,oklch(var(--bc)/0.15))' }} />
                  <span style={{ fontSize: 12, color: 'var(--fallback-bc,oklch(var(--bc)/0.4))' }}>or continue with</span>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--fallback-bc,oklch(var(--bc)/0.15))' }} />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost w-full"
                  style={{ height: 40, fontSize: 14, border: '0.5px solid var(--fallback-bc,oklch(var(--bc)/0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={handleSSOSignIn}
                >
                  <KeyRound size={14} />
                  Sign in with Okta SSO
                </button>
              </>
            )}

            {/* Back-to-SSO link */}
            {ssoEnabled && showPasswordFallback && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  className="text-xs underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--fallback-bc,oklch(var(--bc)/0.4))' }}
                  onClick={() => { setShowPasswordFallback(false); setError(null) }}
                >
                  ← Back to Okta SSO login
                </button>
              </div>
            )}
          </form>
        )}

        <p style={{ fontSize: 12, color: 'var(--fallback-bc,oklch(var(--bc)/0.3))', textAlign: 'center', marginTop: 24 }}>
          Protected by enterprise-grade security
        </p>
      </div>
      </div>
    </div>
  )
}
