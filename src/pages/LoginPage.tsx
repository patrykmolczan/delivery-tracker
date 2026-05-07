import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, AlertCircle, KeyRound, ArrowRight } from 'lucide-react'
import { useLogo } from '../hooks/useLogo'
import { useTheme } from '../contexts/ThemeContext'
import { fetchAppSettings } from '../lib/data'

/* ── Keyframes injected once ── */
const AURORA_KF_ID = 'aurora-login-kf'
const AURORA_CSS = `
@keyframes alp-drift1{0%{transform:translate(0,0) scale(1)}33%{transform:translate(14px,10px) scale(1.05)}66%{transform:translate(8px,20px) scale(0.97)}100%{transform:translate(0,0) scale(1)}}
@keyframes alp-drift2{0%{transform:translate(0,0) scale(1)}40%{transform:translate(-12px,-16px) scale(1.08)}70%{transform:translate(6px,-8px) scale(0.95)}100%{transform:translate(0,0) scale(1)}}
@keyframes alp-drift3{0%{transform:translate(0,0) scale(1);opacity:0.25}50%{transform:translate(-10px,12px) scale(1.1);opacity:0.35}100%{transform:translate(0,0) scale(1);opacity:0.25}}
@keyframes alp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}
@keyframes alp-scan{0%{transform:translateY(-100%);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(200%);opacity:0}}
@keyframes alp-fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes alp-fadeIn{from{opacity:0}to{opacity:1}}
@keyframes alp-cardGlow{0%,100%{box-shadow:0 0 0 0 rgba(14,165,233,0);border-color:rgba(255,255,255,0.08)}50%{box-shadow:0 0 18px 0 rgba(14,165,233,0.15);border-color:rgba(14,165,233,0.28)}}
@keyframes alp-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes alp-logoGlow{0%,100%{box-shadow:0 0 0 0 rgba(14,165,233,0)}50%{box-shadow:0 0 14px 3px rgba(14,165,233,0.35)}}
`

function useInjectAuroraKeyframes() {
  useEffect(() => {
    if (document.getElementById(AURORA_KF_ID)) return
    const el = document.createElement('style')
    el.id = AURORA_KF_ID
    el.textContent = AURORA_CSS
    document.head.appendChild(el)
  }, [])
}

function useCountUp(target: number, suffix: string, decimals: number, delay: number, duration: number) {
  const [value, setValue] = useState('0' + suffix)
  useEffect(() => {
    const t = setTimeout(() => {
      const t0 = performance.now()
      function step(now: number) {
        const p = Math.min((now - t0) / duration, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        const v = target * ease
        setValue(decimals > 0 ? v.toFixed(1) + suffix : Math.round(v) + suffix)
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, delay)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return value
}

/* ── Shared design tokens ── */
const LP = {
  bg: 'linear-gradient(135deg, #0a0a1a 0%, #0f1628 50%, #0a1222 100%)',
  gridLine: 'rgba(255,255,255,0.025)',
  scanColor: 'rgba(14,165,233,0.07)',
  badgeBg: 'rgba(14,165,233,0.12)',
  badgeBorder: 'rgba(14,165,233,0.25)',
  badgeColor: '#38bdf8',
  gradStart: '#38bdf8',
  gradEnd: '#2dd4bf',
  cardBg: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
  footerColor: 'rgba(255,255,255,0.2)',
  subColor: 'rgba(255,255,255,0.45)',
  headlineColor: '#f0f9ff',
}

const STAT_GRAD: React.CSSProperties = {
  background: `linear-gradient(135deg, ${LP.gradStart}, ${LP.gradEnd})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

const GRAD_TEXT: React.CSSProperties = {
  background: `linear-gradient(90deg, ${LP.gradStart}, ${LP.gradEnd})`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

/* ── Sub-components ── */

const LiveDot = () => (
  <span style={{ width: 6, height: 6, background: '#4ade80', borderRadius: '50%', display: 'inline-block', flexShrink: 0, animation: 'alp-pulse 2s infinite' }} />
)

const GridOverlay = ({ size = 32 }: { size?: number }) => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: `linear-gradient(${LP.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${LP.gridLine} 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`, overflow: 'hidden',
  }}>
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 60,
      background: `linear-gradient(to bottom, transparent 0%, ${LP.scanColor} 40%, ${LP.scanColor} 60%, transparent 100%)`,
      animation: 'alp-scan 6s ease-in-out infinite',
    }} />
  </div>
)

const Blob = ({ w, h, color, top, left, bottom, right, opacity, anim, blur = 70 }: {
  w: number; h: number; color: string; top?: number | string; left?: number | string;
  bottom?: number | string; right?: number | string; opacity: number; anim: string; blur?: number
}) => (
  <div style={{
    position: 'absolute', width: w, height: h, borderRadius: '50%',
    filter: `blur(${blur}px)`, background: color,
    top, left, bottom, right, opacity,
    animation: anim,
    pointerEvents: 'none',
  }} />
)

const StatPill = ({ val, label, border }: { val: string; label: string; border?: boolean }) => (
  <>
    {border && <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' }} />}
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, ...STAT_GRAD }}>{val}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{label}</div>
    </div>
  </>
)

export const LoginPage: React.FC = () => {
  const { signIn, signInWithSSO } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { logoUrl } = useLogo()
  const { isDark, toggleTheme } = useTheme()

  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoDomain, setSsoDomain] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  useInjectAuroraKeyframes()

  const stat1 = useCountUp(14.3, 'K', 1, 900, 1200)
  const stat2 = useCountUp(4.2, 'd', 1, 900, 1200)
  const stat3 = useCountUp(96, '%', 0, 900, 1200)

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
    if (!ssoDomain) { setError('SSO domain not configured — contact your administrator.'); return }
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
      } else if (data.rateLimited) {
        const mins = Math.ceil((data.retryAfter ?? 900) / 60)
        setForgotError(`Too many reset requests. Please wait ${mins} minute${mins !== 1 ? 's' : ''} before trying again.`)
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

  /* Right panel theme values */
  const rp = {
    bg: isDark ? '#0d1117' : '#ffffff',
    label: isDark ? 'rgba(255,255,255,0.5)' : '#475569',
    title: isDark ? '#f0f6ff' : '#1e293b',
    sub: isDark ? 'rgba(255,255,255,0.4)' : '#64748b',
    divLine: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    divText: isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8',
    forgot: isDark ? '#38bdf8' : '#0284c7',
    ssoBorder: isDark ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.4)',
    ssoColor: isDark ? '#38bdf8' : '#0284c7',
    footer: isDark ? 'rgba(255,255,255,0.2)' : '#94a3b8',
    logoBg: isDark ? 'rgba(255,255,255,0.92)' : '#f8fafc',
    logoBorder: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
    glow1: isDark ? 'rgba(14,165,233,0.07)' : 'rgba(14,165,233,0.05)',
    glow2: isDark ? 'rgba(45,212,191,0.06)' : 'rgba(45,212,191,0.04)',
  }

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '10px', border: 'none', borderRadius: 8,
    background: 'linear-gradient(135deg, #0ea5e9 0%, #0d9488 50%, #0ea5e9 100%)',
    backgroundSize: '200% auto',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    animation: 'alp-fadeUp 0.5s 0.55s ease both, alp-shimmer 3.5s 2s linear infinite',
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: isDark ? '#0a0a12' : '#eef2f7', fontFamily: 'var(--font-sans, system-ui, sans-serif)', transition: 'background 0.35s', position: 'relative' }}
    >
      {/* ── Theme toggle ── */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          width: 36, height: 36, borderRadius: '50%',
          border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.10)',
          background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
          color: isDark ? '#94a3b8' : '#64748b',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, transition: 'all 0.25s', backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }}
      >
        {isDark ? '☀️' : '🌙'}
      </button>
      <div
        className="flex flex-col lg:flex-row"
        style={{
          width: '100%', maxWidth: 900,
          borderRadius: 16, overflow: 'hidden',
          boxShadow: isDark ? '0 8px 60px rgba(0,0,0,0.55)' : '0 8px 40px rgba(0,0,0,0.12)',
          border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
        }}
      >

        {/* ══════════════════════════════
            MOBILE BANNER (< lg)
        ══════════════════════════════ */}
        <div className="flex lg:hidden flex-col" style={{ position: 'relative', background: LP.bg, overflow: 'hidden' }}>
          {/* Blobs */}
          <Blob w={200} h={200} color="radial-gradient(circle, #0ea5e9 0%, #0284c7 60%, transparent 100%)" top={-60} left={-60} opacity={0.55} anim="alp-drift1 10s ease-in-out infinite" blur={60} />
          <Blob w={160} h={160} color="radial-gradient(circle, #0d9488 0%, #0f766e 60%, transparent 100%)" bottom={-30} right={-30} opacity={0.55} anim="alp-drift2 12s ease-in-out infinite" blur={60} />
          <GridOverlay size={24} />

          <div style={{ position: 'relative', zIndex: 2, padding: '28px 24px 18px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: LP.badgeBg, border: `1px solid ${LP.badgeBorder}`, borderRadius: 999, padding: '3px 10px', fontSize: 10, color: LP.badgeColor, marginBottom: 12, animation: 'alp-fadeUp 0.5s 0.2s ease both' }}>
              <LiveDot /> All systems operational
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: LP.headlineColor, marginBottom: 6, animation: 'alp-fadeUp 0.5s 0.35s ease both' }}>
              Delivery Intelligence{' '}
              <span style={GRAD_TEXT}>Redefined.</span>
            </div>
            <div style={{ fontSize: 11, color: LP.subColor, lineHeight: 1.5, animation: 'alp-fadeUp 0.5s 0.5s ease both' }}>
              Real-time visibility into every project.
            </div>
          </div>

          {/* Mobile stats strip */}
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', position: 'relative', zIndex: 2, animation: 'alp-fadeIn 0.5s 0.6s ease both' }}>
            {[{ val: stat1, label: 'Projects' }, { val: stat2, label: 'Avg ETA' }, { val: stat3, label: 'On-time' }].map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '10px 4px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                <div style={{ fontSize: 14, fontWeight: 700, ...STAT_GRAD }}>{s.val}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════
            DESKTOP LEFT PANEL
        ══════════════════════════════ */}
        <div
          className="hidden lg:flex flex-col justify-between flex-1 overflow-hidden"
          style={{ position: 'relative', background: LP.bg, padding: '40px 36px' }}
        >
          {/* Blobs */}
          <Blob w={260} h={260} color="radial-gradient(circle, #0ea5e9 0%, #0284c7 60%, transparent 100%)" top={-60} left={-60} opacity={0.55} anim="alp-drift1 10s ease-in-out infinite" />
          <Blob w={220} h={220} color="radial-gradient(circle, #0d9488 0%, #0f766e 60%, transparent 100%)" bottom={-40} right={-40} opacity={0.55} anim="alp-drift2 12s ease-in-out infinite" />
          <Blob w={160} h={160} color="radial-gradient(circle, #6366f1 0%, #4f46e5 60%, transparent 100%)" top="50%" left="55%" opacity={0.25} anim="alp-drift3 9s ease-in-out infinite" />
          <GridOverlay size={32} />

          {/* Top */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: LP.badgeBg, border: `1px solid ${LP.badgeBorder}`, borderRadius: 999, padding: '4px 12px', fontSize: 11, color: LP.badgeColor, marginBottom: 24, animation: 'alp-fadeUp 0.6s 0.2s ease both' }}>
              <LiveDot /> All systems operational
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: LP.headlineColor, marginBottom: 10, animation: 'alp-fadeUp 0.6s 0.35s ease both' }}>
              Delivery<br />Intelligence<br />
              <span style={GRAD_TEXT}>Redefined.</span>
            </div>
            <div style={{ fontSize: 12, color: LP.subColor, lineHeight: 1.6, maxWidth: 260, animation: 'alp-fadeUp 0.6s 0.5s ease both' }}>
              Real-time visibility into every project — from intake to delivery.
            </div>
          </div>

          {/* Stats card */}
          <div style={{ position: 'relative', zIndex: 2, background: LP.cardBg, border: `1px solid ${LP.cardBorder}`, borderRadius: 12, padding: '14px 16px', backdropFilter: 'blur(10px)', animation: 'alp-fadeUp 0.6s 0.7s ease both, alp-cardGlow 4s 1.5s ease-in-out infinite' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
              Live platform stats
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <StatPill val={stat1} label="Projects tracked" />
              <StatPill val={stat2} label="Avg ETA" border />
              <StatPill val={stat3} label="On-time rate" border />
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 2, fontSize: 10, color: LP.footerColor, animation: 'alp-fadeIn 0.8s 1s ease both' }}>
            Secure · Enterprise-ready · Magnit Internal Use Only
          </div>
        </div>

        {/* ══════════════════════════════
            RIGHT PANEL (login form)
        ══════════════════════════════ */}
        <div
          className="flex flex-col justify-center w-full lg:w-auto"
          style={{
            background: rp.bg,
            padding: '40px 40px 48px',
            flex: '0 0 380px',
            position: 'relative',
            transition: 'background 0.35s',
          }}
        >
          {/* Ambient glows */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, background: `radial-gradient(circle, ${rp.glow1} 0%, transparent 70%)`, pointerEvents: 'none', animation: 'alp-drift1 10s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, background: `radial-gradient(circle, ${rp.glow2} 0%, transparent 70%)`, pointerEvents: 'none', animation: 'alp-drift2 12s ease-in-out infinite' }} />

          <div style={{ position: 'relative', zIndex: 2 }}>
            {/* Logo */}
            {logoUrl && (
              <div className="hidden lg:flex" style={{ justifyContent: 'flex-end', marginBottom: 24, animation: 'alp-fadeUp 0.5s 0.1s ease both' }}>
                <div style={{ background: rp.logoBg, border: `1px solid ${rp.logoBorder}`, borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', transition: 'background 0.35s, border-color 0.35s' }}>
                  <img src={logoUrl} alt="Company Logo" style={{ height: 42, width: 'auto', display: 'block', maxWidth: 220 }} />
                </div>
              </div>
            )}
            {logoUrl && (
              <div className="flex lg:hidden" style={{ position: 'absolute', top: -28, right: 0 }}>
                <img src={logoUrl} alt="Company Logo" style={{ height: 26, width: 'auto', display: 'block', maxWidth: 130 }} />
              </div>
            )}

            {/* Heading */}
            <div style={{ marginBottom: logoUrl ? 0 : 28, animation: 'alp-fadeUp 0.5s 0.2s ease both' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: rp.footer, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, transition: 'color 0.35s' }}>
                Delivery Tracker
              </p>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: rp.title, marginBottom: 6, transition: 'color 0.35s' }}>
                Welcome back
              </h1>
              <p style={{ fontSize: 14, color: rp.sub, marginBottom: 28, transition: 'color 0.35s' }}>
                Sign in to your account to continue
              </p>
            </div>

            {/* ── SSO Mode ── */}
            {showSSO && (
              <div className="space-y-4">
                <button type="button" style={btnStyle} disabled={loading} onClick={handleSSOSignIn}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={15} />}
                  {loading ? 'Redirecting to Okta…' : 'Sign in with Okta SSO'}
                </button>
                {error && (
                  <div className="alert alert-error py-2">
                    <AlertCircle size={16} /><span className="text-sm">{error}</span>
                  </div>
                )}
                <div className="text-center">
                  <button type="button" style={{ fontSize: 12, color: rp.footer, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, transition: 'color 0.35s' }}
                    onClick={() => { setShowPasswordFallback(true); setError(null) }}>
                    Sign in with email &amp; password instead
                  </button>
                </div>
              </div>
            )}

            {/* ── Password Mode ── */}
            {showPassword && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ marginBottom: 16, animation: 'alp-fadeUp 0.5s 0.35s ease both' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: rp.label, marginBottom: 6, letterSpacing: '0.02em', transition: 'color 0.35s' }}>
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

                <div style={{ marginBottom: 8, animation: 'alp-fadeUp 0.5s 0.45s ease both' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: rp.label, marginBottom: 6, letterSpacing: '0.02em', transition: 'color 0.35s' }}>
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
                    <AlertCircle size={16} /><span className="text-sm">{error}</span>
                  </div>
                )}

                <button type="submit" style={{ ...btnStyle, marginTop: 16 }} disabled={loading}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {loading ? 'Signing in...' : 'Sign in'}
                  {!loading && <ArrowRight size={14} />}
                </button>

                {/* Forgot password */}
                {!forgotSent ? (
                  <div style={{ textAlign: 'center', marginTop: 12, animation: 'alp-fadeUp 0.5s 0.65s ease both' }}>
                    <button type="button" onClick={handleForgotPassword} disabled={forgotLoading}
                      style={{ fontSize: 12, color: rp.forgot, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, transition: 'color 0.35s' }}>
                      {forgotLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                    {forgotError && <p className="text-xs text-error mt-1">{forgotError}</p>}
                  </div>
                ) : (
                  <div className="alert alert-success py-2 mt-3">
                    <span className="text-sm">✓ Password reset email sent — check your inbox.</span>
                  </div>
                )}

                {/* SSO fallback */}
                {!ssoEnabled && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', animation: 'alp-fadeUp 0.5s 0.7s ease both' }}>
                      <div style={{ flex: 1, height: 1, background: rp.divLine, transition: 'background 0.35s' }} />
                      <span style={{ fontSize: 11, color: rp.divText, transition: 'color 0.35s' }}>or continue with</span>
                      <div style={{ flex: 1, height: 1, background: rp.divLine, transition: 'background 0.35s' }} />
                    </div>
                    <button type="button" onClick={handleSSOSignIn}
                      style={{ width: '100%', padding: '9px', background: 'transparent', border: `1px solid ${rp.ssoBorder}`, borderRadius: 8, color: rp.ssoColor, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, animation: 'alp-fadeUp 0.5s 0.75s ease both', transition: 'border-color 0.2s, color 0.35s' }}>
                      <KeyRound size={14} />
                      Sign in with Okta SSO
                    </button>
                  </>
                )}

                {/* Back to SSO */}
                {ssoEnabled && showPasswordFallback && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button type="button" onClick={() => { setShowPasswordFallback(false); setError(null) }}
                      style={{ fontSize: 12, color: rp.footer, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, transition: 'color 0.35s' }}>
                      ← Back to Okta SSO login
                    </button>
                  </div>
                )}
              </form>
            )}

            <p style={{ fontSize: 12, color: rp.footer, textAlign: 'center', marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'color 0.35s', animation: 'alp-fadeIn 0.6s 1s ease both' }}>
              <span>🔐</span> Protected by enterprise-grade security
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
