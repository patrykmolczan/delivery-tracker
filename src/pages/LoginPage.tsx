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

  const showSSO = ssoEnabled && settingsLoaded && !showPasswordFallback
  const showPassword = !ssoEnabled || showPasswordFallback

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-6" style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      <div style={{ display: 'flex', width: '100%', maxWidth: 900, minHeight: 560, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid var(--fallback-bc,oklch(var(--bc)/0.1))' }}>

      {/* ── Left panel ───────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between flex-1 overflow-hidden relative"
        style={{ background: '#0C447C', padding: '48px 40px', minWidth: 0 }}
      >
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
          <circle cx="130" cy="60" r="24" fill="none" stroke="#5DCAA5" strokeWidth="1" opacity="0.5">
            <animate attributeName="r" values="18;28;18" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="2.5s" repeatCount="indefinite" />
          </circle>

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
        }}
      >
        {/* Logo — top right, pulled from app_settings via useLogo() */}
        {logoUrl && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
            <div style={{
              background: isDark ? 'rgba(255,255,255,0.92)' : 'var(--fallback-b2,oklch(var(--b2)))',
              border: '0.5px solid var(--fallback-bc,oklch(var(--bc)/0.1))',
              borderRadius: 8,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
            }}>
              <img src={logoUrl} alt="Company Logo" style={{ height: 24, width: 'auto', display: 'block' }} />
            </div>
          </div>
        )}

        {/* Login icon if set */}
        {loginIconUrl && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <img src={loginIconUrl} alt="Login Icon" style={{ maxHeight: 48, maxWidth: 120, objectFit: 'contain' }} />
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
