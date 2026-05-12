import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLogo } from '../hooks/useLogo'
import { useTheme } from '../contexts/ThemeContext'
import { fetchAppSettings } from '../lib/data'
import LightModeRounded from '@mui/icons-material/LightModeRounded'
import DarkModeRounded from '@mui/icons-material/DarkModeRounded'
import VpnKeyRounded from '@mui/icons-material/VpnKeyRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutorenewRounded from '@mui/icons-material/AutorenewRounded'
import LockRounded from '@mui/icons-material/LockRounded'
import BoltRounded from '@mui/icons-material/BoltRounded'
import InsightsRounded from '@mui/icons-material/InsightsRounded'
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded'
import TimerRounded from '@mui/icons-material/TimerRounded'
import TaskAltRounded from '@mui/icons-material/TaskAltRounded'

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

/* ── Shared design tokens (moved inside component for theme reactivity) ── */


/* ── Sub-components ── */

const LiveDot = ({ size = 6 }: { size?: number }) => (
  <span style={{ width: size, height: size, background: '#4ade80', borderRadius: '50%', display: 'inline-block', flexShrink: 0, animation: 'alp-pulse 2s infinite' }} />
)

const GridOverlay = ({ size = 28, color = 'rgba(99,179,237,0.06)' }: { size?: number; color?: string }) => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`, overflow: 'hidden',
    transition: 'background-image 0.35s',
  }} />
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

const StatPill = ({
  val, label, icon,
  valColor = '#f0f8ff',
  labelColor = 'rgba(180,210,255,0.5)',
  bg = 'rgba(14,165,233,0.08)',
  border = '1px solid rgba(14,165,233,0.18)',
}: {
  val: string; label: string; icon?: React.ReactNode;
  valColor?: string; labelColor?: string; bg?: string; border?: string;
}) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    background: bg,
    border: border,
    borderRadius: 8,
    padding: '10px 12px',
    minWidth: 64,
    flex: 1,
    textAlign: 'center',
    transition: 'background 0.35s, border-color 0.35s',
  }}>
    {icon && (
      <span style={{ fontSize: 14, marginBottom: 2, lineHeight: 1 }}>{icon}</span>
    )}
    <div style={{ fontSize: 15, fontWeight: 700, color: valColor, lineHeight: 1.1, transition: 'color 0.35s' }}>{val}</div>
    <div style={{ fontSize: 9, color: labelColor, marginTop: 1, transition: 'color 0.35s' }}>{label}</div>
  </div>
)

export const LoginPage: React.FC = () => {
  const { signIn, signInWithSSO } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { logoUrl } = useLogo()
  const { isDark, toggleTheme } = useTheme()

  /* ── Left panel design tokens — reactive to theme ── */
  const LP = isDark ? {
    bg: 'linear-gradient(155deg, #04090f 0%, #070e1c 40%, #080f20 100%)',
    accent1: '#06b6d4',        // cyan
    accent2: '#818cf8',        // indigo
    accent3: '#34d399',        // emerald
    accent4: '#f59e0b',        // amber
    headline: '#e2eeff',
    sub: 'rgba(180,210,255,0.5)',
    eyebrow: 'rgba(99,210,255,0.65)',
    badgeBg: 'rgba(6,182,212,0.12)',
    badgeBorder: 'rgba(6,182,212,0.28)',
    badgeColor: '#22d3ee',
    cardBg: 'rgba(6,182,212,0.05)',
    cardBorder: '1px solid rgba(6,182,212,0.14)',
    gridColor: 'rgba(6,182,212,0.055)',
    ringTrack: 'rgba(255,255,255,0.06)',
    footerColor: 'rgba(200,230,255,0.22)',
    liveFooterDot: '#22d3ee',
    liveFooterGlow: 'rgba(6,182,212,0.6)',
    sparkTop: 'rgba(6,182,212,0.7)',
    sparkBot: 'rgba(52,211,153,0.4)',
    statVal: '#e2eeff',
    statLabel: 'rgba(180,210,255,0.48)',
    statIcon: '#06b6d4' as string,
    statBg: 'rgba(6,182,212,0.08)',
    statBorder: '1px solid rgba(6,182,212,0.18)',
    pipelineBg: 'rgba(255,255,255,0.04)',
    pipelineBorder: '1px solid rgba(255,255,255,0.08)',
    blob1: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)',
    blob2: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
    blob3: 'radial-gradient(circle, rgba(52,211,153,0.10) 0%, transparent 70%)',
  } : {
    bg: 'linear-gradient(155deg, #f0f7ff 0%, #e8f2fb 40%, #ddeefa 100%)',
    accent1: '#0284c7',
    accent2: '#6366f1',
    accent3: '#059669',
    accent4: '#d97706',
    headline: '#0c1a2e',
    sub: 'rgba(15,23,42,0.52)',
    eyebrow: 'rgba(2,132,199,0.75)',
    badgeBg: 'rgba(2,132,199,0.09)',
    badgeBorder: 'rgba(2,132,199,0.22)',
    badgeColor: '#0284c7',
    cardBg: 'rgba(255,255,255,0.82)',
    cardBorder: '1px solid rgba(6,182,212,0.16)',
    gridColor: 'rgba(6,182,212,0.045)',
    ringTrack: 'rgba(0,0,0,0.07)',
    footerColor: 'rgba(15,23,42,0.32)',
    liveFooterDot: '#0284c7',
    liveFooterGlow: 'rgba(2,132,199,0.45)',
    sparkTop: 'rgba(2,132,199,0.6)',
    sparkBot: 'rgba(5,150,105,0.35)',
    statVal: '#0c1a2e',
    statLabel: 'rgba(15,23,42,0.48)',
    statIcon: '#0284c7' as string,
    statBg: 'rgba(2,132,199,0.07)',
    statBorder: '1px solid rgba(2,132,199,0.15)',
    pipelineBg: 'rgba(255,255,255,0.7)',
    pipelineBorder: '1px solid rgba(6,182,212,0.14)',
    blob1: 'radial-gradient(circle, rgba(6,182,212,0.13) 0%, transparent 70%)',
    blob2: 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)',
    blob3: 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)',
  }

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
      className="min-h-screen flex items-center justify-center"
      style={{
        background: isDark ? '#020817' : '#f0f4f8',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        transition: 'background 0.4s',
        position: 'relative',
        minHeight: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* Full-screen radial glow overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background: isDark
            ? 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(6,182,212,0.08) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(6,182,212,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Theme toggle — fixed top-right */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed',
          top: 22,
          right: 22,
          zIndex: 100,
          width: 72,
          height: 32,
          borderRadius: 999,
          border: isDark
            ? '1px solid rgba(6,182,212,0.25)'
            : '1px solid rgba(0,0,0,0.12)',
          background: isDark
            ? 'rgba(6,182,212,0.12)'
            : 'rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 0,
          cursor: 'pointer',
          transition: 'background 0.3s, border-color 0.3s',
          boxShadow: isDark
            ? '0 2px 12px rgba(6,182,212,0.08)'
            : '0 2px 8px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#22d3ee' : '#0891b2',
            opacity: isDark ? 0.5 : 1,
            fontSize: 18,
            transition: 'color 0.3s, opacity 0.3s',
          }}
        >
          <LightModeRounded />
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: isDark
              ? '#22d3ee'
              : '#0891b2',
            position: 'absolute',
            left: isDark ? 38 : 6,
            top: 2,
            transition: 'left 0.3s, background 0.3s',
            boxShadow: isDark
              ? '0 0 0 2px rgba(6,182,212,0.15)'
              : '0 0 0 2px rgba(8,145,178,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isDark ? (
            <DarkModeRounded sx={{ color: '#fff', fontSize: 18 }} />
          ) : (
            <LightModeRounded sx={{ color: '#fff', fontSize: 18 }} />
          )}
        </span>
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#22d3ee' : '#0891b2',
            opacity: isDark ? 1 : 0.5,
            fontSize: 18,
            transition: 'color 0.3s, opacity 0.3s',
          }}
        >
          <DarkModeRounded />
        </span>
      </button>

      {/* Main card */}
      <div
        className="flex flex-col lg:flex-row"
        style={{
          width: '100%',
          maxWidth: 1000,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: isDark
            ? '0 25px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.1)'
            : '0 20px 60px rgba(0,0,0,0.1), 0 0 0 1px rgba(6,182,212,0.12)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* MOBILE BANNER */}
        <div
          className="flex lg:hidden flex-col"
          style={{
            background: isDark
              ? 'linear-gradient(160deg, #04090f 0%, #070e1c 60%, #080f20 100%)'
              : 'linear-gradient(160deg, #e8f4fd 0%, #dbeafe 60%, #cfe9fb 100%)',
            position: 'relative',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <GridOverlay size={28} color={LP.gridColor} />
          <Blob w={200} h={200} color={LP.blob1} top={-60} left={-60} opacity={1} anim="alp-drift1 12s ease-in-out infinite" blur={70} />
          <Blob w={150} h={150} color={LP.blob2} bottom={-40} right={-30} opacity={1} anim="alp-drift2 14s ease-in-out infinite" blur={60} />

          <div style={{ position: 'relative', zIndex: 2, padding: '28px 22px 0' }}>
            {/* Eyebrow */}
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: LP.eyebrow, textTransform: 'uppercase', marginBottom: 8, animation: 'alp-fadeUp 0.5s 0.1s ease both' }}>
              PROJECT DELIVERY TRACKER
            </div>
            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: LP.badgeBg, border: `1px solid ${LP.badgeBorder}`, borderRadius: 999, padding: '3px 9px', fontSize: 10, color: LP.badgeColor, marginBottom: 10, animation: 'alp-fadeUp 0.5s 0.18s ease both' }}>
              <LiveDot /> Systems nominal
            </div>
            {/* Headline */}
            <div style={{ fontSize: 20, fontWeight: 900, color: LP.headline, lineHeight: 1.2, letterSpacing: '-0.5px', animation: 'alp-fadeUp 0.5s 0.26s ease both' }}>
              Mission{' '}
              <span style={{ background: `linear-gradient(90deg, ${LP.accent1}, ${LP.accent3})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Control
              </span>
            </div>
            <div style={{ fontSize: 11, color: LP.sub, marginTop: 5, marginBottom: 14, lineHeight: 1.5, animation: 'alp-fadeUp 0.5s 0.34s ease both' }}>
              Intake-to-delivery visibility for fast teams.
            </div>

            {/* Mini pipeline stages — horizontal scroll strip */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 0, animation: 'alp-fadeUp 0.5s 0.42s ease both', overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { label: 'Intake', pct: 100, color: LP.accent3 },
                { label: 'Build', pct: 78, color: LP.accent1 },
                { label: 'QA', pct: 55, color: LP.accent2 },
                { label: 'Deploy', pct: 32, color: LP.accent4 },
              ].map((stage, i) => (
                <div key={i} style={{ minWidth: 68, background: LP.pipelineBg, border: LP.pipelineBorder, borderRadius: 10, padding: '8px 10px', backdropFilter: 'blur(12px)', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: LP.statLabel, letterSpacing: '0.06em', marginBottom: 4 }}>{stage.label}</div>
                  <div style={{ height: 4, borderRadius: 99, background: LP.ringTrack, marginBottom: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${stage.pct}%`, height: '100%', borderRadius: 99, background: stage.color, animation: `alp-data-float ${2 + i * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.15}s` }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: LP.statVal }}>{stage.pct}<span style={{ fontSize: 9, color: LP.statLabel }}>%</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile stat strip */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 22px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(6,182,212,0.12)'}`, background: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.65)', zIndex: 2, position: 'relative', marginTop: 14 }}>
            <StatPill val={stat1} label="Projects" icon={<Inventory2Rounded sx={{ fontSize: 13, color: LP.statIcon }} />} valColor={LP.statVal} labelColor={LP.statLabel} bg={LP.statBg} border={LP.statBorder} />
            <StatPill val={stat2} label="Avg ETA" icon={<TimerRounded sx={{ fontSize: 13, color: LP.statIcon }} />} valColor={LP.statVal} labelColor={LP.statLabel} bg={LP.statBg} border={LP.statBorder} />
            <StatPill val={stat3} label="On-time" icon={<TaskAltRounded sx={{ fontSize: 13, color: LP.statIcon }} />} valColor={LP.statVal} labelColor={LP.statLabel} bg={LP.statBg} border={LP.statBorder} />
          </div>
        </div>

        {/* DESKTOP LEFT PANEL */}
        <div
          className="hidden lg:flex flex-col justify-between"
          style={{
            flex: 1,
            minHeight: 560,
            position: 'relative',
            background: LP.bg,
            padding: '48px 44px',
            transition: 'background 0.4s',
            overflow: 'hidden',
          }}
        >
          {/* ── BG layers ── */}
          <GridOverlay size={28} color={LP.gridColor} />
          <Blob w={380} h={380} color={LP.blob1} top={-120} left={-120} opacity={1} anim="alp-drift1 15s ease-in-out infinite" blur={110} />
          <Blob w={300} h={300} color={LP.blob2} bottom={-90} right={-90} opacity={1} anim="alp-drift2 17s ease-in-out infinite" blur={100} />
          <Blob w={220} h={220} color={LP.blob3} top="38%" left="42%" opacity={1} anim="alp-drift3 12s ease-in-out infinite" blur={80} />

          {/* ── Vertical ticker strip (right edge) ── */}
          <div
            style={{
              position: 'absolute',
              right: 18,
              top: 60,
              bottom: 60,
              width: 2,
              borderRadius: 99,
              background: isDark ? 'rgba(6,182,212,0.09)' : 'rgba(6,182,212,0.12)',
              pointerEvents: 'none',
              zIndex: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '35%',
                background: `linear-gradient(to bottom, transparent, ${LP.accent1}, transparent)`,
                animation: 'alp-scan-line 4s linear infinite',
                opacity: 0.7,
              }}
            />
          </div>

          {/* ── Horizontal scan line ── */}
          <div
            style={{
              position: 'absolute',
              left: 0, right: 0, top: 0,
              height: 140,
              background: `linear-gradient(to bottom, transparent, rgba(6,182,212,0.04) 50%, transparent)`,
              animation: 'alp-scan-line 12s linear infinite',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* ── TOP SECTION ── */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {/* Eyebrow */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: LP.eyebrow,
                textTransform: 'uppercase',
                marginBottom: 14,
                animation: 'alp-fadeUp 0.6s 0.15s ease both',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 18,
                  height: 2,
                  borderRadius: 99,
                  background: `linear-gradient(90deg, ${LP.accent1}, ${LP.accent2})`,
                }}
              />
              PROJECT DELIVERY TRACKER
            </div>

            {/* Live badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: LP.badgeBg,
                border: `1px solid ${LP.badgeBorder}`,
                borderRadius: 999,
                padding: '4px 12px',
                fontSize: 11,
                color: LP.badgeColor,
                marginBottom: 22,
                animation: 'alp-fadeUp 0.6s 0.22s ease both',
              }}
            >
              <LiveDot /> All systems nominal
            </div>

            {/* Headline */}
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                lineHeight: 1.12,
                letterSpacing: '-1.5px',
                color: LP.headline,
                animation: 'alp-fadeUp 0.6s 0.3s ease both',
              }}
            >
              <div>Mission</div>
              <div>
                <span
                  style={{
                    background: `linear-gradient(95deg, ${LP.accent1} 0%, ${LP.accent2} 50%, ${LP.accent3} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Control.
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginTop: 2 }}>Delivered.</div>
            </div>

            {/* Sub */}
            <div
              style={{
                fontSize: 13,
                color: LP.sub,
                lineHeight: 1.75,
                maxWidth: 270,
                marginTop: 12,
                animation: 'alp-fadeUp 0.6s 0.4s ease both',
              }}
            >
              End-to-end visibility from intake to deployment — for teams that operate at scale.
            </div>

            {/* ── DELIVERY RING CLUSTER (SVG) ── */}
            <div
              style={{
                marginTop: 28,
                position: 'relative',
                width: 156,
                height: 156,
                animation: 'alp-fadeUp 0.6s 0.5s ease both',
              }}
            >
              <svg width="156" height="156" viewBox="0 0 156 156">
                {/* Ring 1 — Projects (outermost) */}
                <circle cx="78" cy="78" r="68" fill="none" stroke={LP.ringTrack} strokeWidth="7" />
                <circle
                  cx="78" cy="78" r="68"
                  fill="none"
                  stroke={LP.accent1}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 68}`}
                  strokeDashoffset={`${2 * Math.PI * 68 * (1 - 0.82)}`}
                  transform="rotate(-90 78 78)"
                  style={{ filter: `drop-shadow(0 0 5px ${LP.accent1})`, animation: 'alp-node-pulse 3.2s ease-in-out infinite' }}
                />
                {/* Ring 2 — On-time % */}
                <circle cx="78" cy="78" r="54" fill="none" stroke={LP.ringTrack} strokeWidth="6" />
                <circle
                  cx="78" cy="78" r="54"
                  fill="none"
                  stroke={LP.accent3}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (1 - 0.96)}`}
                  transform="rotate(-90 78 78)"
                  style={{ filter: `drop-shadow(0 0 4px ${LP.accent3})`, animation: 'alp-node-pulse 2.8s 0.4s ease-in-out infinite' }}
                />
                {/* Ring 3 — Pipeline fill (innermost) */}
                <circle cx="78" cy="78" r="40" fill="none" stroke={LP.ringTrack} strokeWidth="5" />
                <circle
                  cx="78" cy="78" r="40"
                  fill="none"
                  stroke={LP.accent2}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - 0.64)}`}
                  transform="rotate(-90 78 78)"
                  style={{ filter: `drop-shadow(0 0 4px ${LP.accent2})`, animation: 'alp-node-pulse 3.6s 0.8s ease-in-out infinite' }}
                />
                {/* Center label */}
                <text x="78" y="72" textAnchor="middle" style={{ fill: LP.headline, fontSize: 18, fontWeight: 800, fontFamily: 'inherit' }}>96%</text>
                <text x="78" y="88" textAnchor="middle" style={{ fill: LP.sub as string, fontSize: 9, fontFamily: 'inherit', letterSpacing: '0.06em' }}>ON-TIME</text>
              </svg>

              {/* Ring legend */}
              <div
                style={{
                  position: 'absolute',
                  right: -90,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {[
                  { color: LP.accent1, label: 'Projects', val: '82%' },
                  { color: LP.accent3, label: 'On-time', val: '96%' },
                  { color: LP.accent2, label: 'Pipeline', val: '64%' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: `0 0 5px ${item.color}`, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: LP.statLabel }}>{item.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: LP.statVal, marginLeft: 2 }}>{item.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── DELIVERY PIPELINE CARD ── */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              background: LP.cardBg,
              border: LP.cardBorder,
              borderRadius: 16,
              padding: '16px 18px',
              backdropFilter: 'blur(20px)',
              animation: 'alp-fadeUp 0.6s 0.62s ease both, alp-cardGlow 5s 1.5s ease-in-out infinite',
              boxShadow: isDark ? '0 4px 32px rgba(6,182,212,0.07)' : '0 4px 24px rgba(6,182,212,0.06)',
              marginTop: 12,
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.14em', color: LP.statLabel, textTransform: 'uppercase' }}>DELIVERY PIPELINE</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 999, padding: '2px 7px' }}>
                <LiveDot size={5} /> LIVE
              </span>
            </div>

            {/* 4 Pipeline stages */}
            {[
              { stage: 'Intake',   pct: 100, count: '142 tasks',  color: LP.accent3, delay: 0   },
              { stage: 'Build',    pct: 78,  count: '89 active',  color: LP.accent1, delay: 0.1 },
              { stage: 'QA / UAT', pct: 55, count: '37 pending',  color: LP.accent2, delay: 0.2 },
              { stage: 'Deploy',   pct: 32,  count: '12 queued',  color: LP.accent4, delay: 0.3 },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: i < 3 ? 10 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, display: 'inline-block', boxShadow: `0 0 5px ${item.color}80`, animation: 'alp-pulse 2s infinite', animationDelay: `${item.delay}s` }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: LP.statVal }}>{item.stage}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: LP.statLabel }}>{item.count}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.pct}%</span>
                  </div>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: LP.ringTrack, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${item.pct}%`,
                      height: '100%',
                      borderRadius: 99,
                      background: `linear-gradient(90deg, ${item.color}cc, ${item.color})`,
                      animation: `alp-data-float ${2.8 + i * 0.4}s ease-in-out infinite`,
                      animationDelay: `${item.delay}s`,
                      boxShadow: `0 0 6px ${item.color}60`,
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Sparkline footer */}
            <div style={{ marginTop: 14, display: 'flex', gap: 2, alignItems: 'flex-end', height: 20 }}>
              {[55,72,48,85,62,93,78,100,82,97,68,90].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    borderRadius: 2,
                    background: `linear-gradient(to top, ${LP.sparkTop}, ${LP.sparkBot})`,
                    animation: `alp-data-float ${2.4 + (i % 3) * 0.45}s ease-in-out infinite`,
                    animationDelay: `${i * 0.11}s`,
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: LP.statLabel }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'alp-pulse 2s infinite' }} />
              Updated just now
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              fontSize: 10,
              color: LP.footerColor,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: LP.liveFooterDot,
                boxShadow: `0 0 7px ${LP.liveFooterGlow}`,
                animation: 'alp-pulse 2.4s infinite',
              }}
            />
            Secure · Enterprise-ready · Magnit Internal Use Only
          </div>
        </div>

        {/* RIGHT PANEL (login form) */}
        <div
          className="flex flex-col justify-center w-full lg:w-auto"
          style={{
            flex: '0 0 400px',
            background: isDark ? '#0d1117' : '#ffffff',
            position: 'relative',
            padding: '44px 44px 52px',
            transition: 'background 0.4s',
            minWidth: 0,
          }}
        >
          {/* Ambient glows */}
          <div
            style={{
              position: 'absolute',
              top: -80,
              right: -80,
              width: 220,
              height: 220,
              background: `radial-gradient(circle, ${rp.glow1} 0%, transparent 70%)`,
              pointerEvents: 'none',
              animation: 'alp-drift1 10s ease-in-out infinite',
              zIndex: 1,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -60,
              left: -60,
              width: 180,
              height: 180,
              background: `radial-gradient(circle, ${rp.glow2} 0%, transparent 70%)`,
              pointerEvents: 'none',
              animation: 'alp-drift2 12s ease-in-out infinite',
              zIndex: 1,
            }}
          />
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

            {/* Heading block */}
            <div
              style={{
                marginBottom: logoUrl ? 20 : 32,
                animation: 'alp-fadeUp 0.5s 0.2s ease both',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  color: rp.footer,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  transition: 'color 0.35s',
                }}
              >
                DELIVERY TRACKER
              </div>
              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: rp.title,
                  marginBottom: 6,
                  letterSpacing: '-0.5px',
                  transition: 'color 0.35s',
                }}
              >
                Welcome back
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: rp.sub,
                  marginBottom: 28,
                  transition: 'color 0.35s',
                }}
              >
                Sign in to your account to continue
              </p>
            </div>

            {/* SSO MODE */}
            {showSSO && (
              <div className="space-y-4">
                <button type="button" style={btnStyle} disabled={loading} onClick={handleSSOSignIn}>
                  {loading ? <AutorenewRounded sx={{ fontSize: 17 }} className="animate-spin" /> : <VpnKeyRounded sx={{ fontSize: 17 }} />}
                  {loading ? 'Redirecting to Okta…' : 'Sign in with Okta SSO'}
                </button>
                {error && (
                  <div className="alert alert-error py-2">
                    <ErrorOutlineRounded sx={{ fontSize: 18 }} /><span className="text-sm">{error}</span>
                  </div>
                )}
                <div className="text-center">
                  <button
                    type="button"
                    style={{
                      fontSize: 12,
                      color: rp.footer,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                      transition: 'color 0.35s',
                    }}
                    onClick={() => {
                      setShowPasswordFallback(true);
                      setError(null);
                    }}
                  >
                    Sign in with email &amp; password instead
                  </button>
                </div>
              </div>
            )}

            {/* PASSWORD MODE */}
            {showPassword && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* EMAIL FIELD */}
                <div style={{ marginBottom: 18, animation: 'alp-fadeUp 0.5s 0.35s ease both' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: rp.label,
                      marginBottom: 6,
                      letterSpacing: '0.02em',
                      transition: 'color 0.35s',
                    }}
                  >
                    Work email
                  </label>
                  <input
                    type="email"
                    className="input input-bordered w-full"
                    style={{ height: 42, fontSize: 14 }}
                    placeholder="you@magnitglobal.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {/* PASSWORD FIELD */}
                <div style={{ marginBottom: 8, animation: 'alp-fadeUp 0.5s 0.45s ease both' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 500,
                      color: rp.label,
                      marginBottom: 6,
                      letterSpacing: '0.02em',
                      transition: 'color 0.35s',
                    }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    className="input input-bordered w-full"
                    style={{ height: 42, fontSize: 14 }}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                {/* ERROR */}
                {error && (
                  <div className="alert alert-error py-2 mt-2">
                    <ErrorOutlineRounded sx={{ fontSize: 18 }} /><span className="text-sm">{error}</span>
                  </div>
                )}
                {/* SUBMIT BUTTON */}
                <button type="submit" style={{ ...btnStyle, marginTop: 18 }} disabled={loading}>
                  {loading ? <AutorenewRounded sx={{ fontSize: 17 }} className="animate-spin" /> : null}
                  {loading ? 'Signing in...' : 'Sign in'}
                  {!loading && <ArrowForwardRounded sx={{ fontSize: 17 }} />}
                </button>
                {/* FORGOT PASSWORD */}
                {!forgotSent ? (
                  <div style={{ textAlign: 'center', marginTop: 12, animation: 'alp-fadeUp 0.5s 0.65s ease both' }}>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotLoading}
                      style={{
                        fontSize: 12,
                        color: rp.forgot,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                        transition: 'color 0.35s',
                      }}
                    >
                      {forgotLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                    {forgotError && <p className="text-xs text-error mt-1">{forgotError}</p>}
                  </div>
                ) : (
                  <div className="alert alert-success py-2 mt-3">
                    <span className="text-sm">✓ Password reset email sent — check your inbox.</span>
                  </div>
                )}
                {/* SSO DIVIDER + BUTTON (when !ssoEnabled) */}
                {!ssoEnabled && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0', animation: 'alp-fadeUp 0.5s 0.7s ease both' }}>
                      <div style={{ flex: 1, height: 1, background: rp.divLine, transition: 'background 0.35s' }} />
                      <span style={{ fontSize: 11, color: rp.divText, transition: 'color 0.35s' }}>or continue with</span>
                      <div style={{ flex: 1, height: 1, background: rp.divLine, transition: 'background 0.35s' }} />
                    </div>
                    <button
                      type="button"
                      onClick={handleSSOSignIn}
                      style={{
                        width: '100%',
                        padding: '9px',
                        background: 'transparent',
                        border: `1px solid ${rp.ssoBorder}`,
                        borderRadius: 8,
                        color: rp.ssoColor,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        animation: 'alp-fadeUp 0.5s 0.75s ease both',
                        transition: 'border-color 0.2s, color 0.35s',
                      }}
                    >
                      <VpnKeyRounded sx={{ fontSize: 17 }} />
                      Sign in with Okta SSO
                    </button>
                  </>
                )}
                {/* BACK TO SSO (when ssoEnabled && showPasswordFallback) */}
                {ssoEnabled && showPasswordFallback && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordFallback(false);
                        setError(null);
                      }}
                      style={{
                        fontSize: 12,
                        color: rp.footer,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                        transition: 'color 0.35s',
                      }}
                    >
                      <ArrowBackRounded sx={{ fontSize: 14 }} /> Back to Okta SSO login
                    </button>
                  </div>
                )}
              </form>
            )}
            {/* FOOTER */}
            <p
              style={{
                fontSize: 12,
                color: rp.footer,
                textAlign: 'center',
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'color 0.35s',
                animation: 'alp-fadeIn 0.6s 1s ease both',
              }}
            >
              <LockRounded sx={{ fontSize: 14, opacity: 0.7 }} /> Protected by enterprise-grade security
            </p>
          </div>
        </div>
      </div>
      {/* Responsive padding for mobile right panel */}
      <style>
        {`
          @media (max-width: 640px) {
            .flex.lg\\:flex-row > .flex-col.justify-center.w-full.lg\\:w-auto {
              padding: 32px 24px 40px !important;
            }
          }
        `}
      </style>
    </div>
  )
}

/* ── DaaS Keyframes ── */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (!document.getElementById('alp-daas-kf')) {
    const style = document.createElement('style')
    style.id = 'alp-daas-kf'
    style.textContent = `
@keyframes alp-node-pulse {
  0%,100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
}
@keyframes alp-flow-dash {
  0% { stroke-dashoffset: 200; }
  100% { stroke-dashoffset: 0; }
}
@keyframes alp-data-float {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes alp-scan-line {
  0% { transform: translateY(-100%); opacity: 0; }
  10% { opacity: 0.4; }
  90% { opacity: 0.4; }
  100% { transform: translateY(100%); opacity: 0; }
}
    `
    document.head.appendChild(style)
  }
}
