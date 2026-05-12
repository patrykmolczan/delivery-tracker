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
    bg: 'linear-gradient(160deg, #050d1a 0%, #071325 55%, #081b33 100%)',
    accent: '#06b6d4',
    accent2: '#6366f1',
    accent3: '#10b981',
    headlineColor: '#f0f9ff',
    subColor: 'rgba(186,230,255,0.52)',
    eyebrow: 'rgba(6,182,212,0.75)',
    badgeBg: 'rgba(6,182,212,0.1)',
    badgeBorder: 'rgba(6,182,212,0.28)',
    badgeColor: '#22d3ee',
    footerColor: 'rgba(255,255,255,0.2)',
    cardBg: 'rgba(6,182,212,0.045)',
    cardBorder: 'rgba(6,182,212,0.14)',
    trackBg: 'rgba(255,255,255,0.05)',
    trackGlow: 'rgba(6,182,212,0.22)',
    statVal: '#f0f9ff',
    statLabel: 'rgba(186,230,255,0.48)',
    statRingBg: 'rgba(6,182,212,0.1)',
    meshColor: 'rgba(6,182,212,0.055)',
    particleColor: '#22d3ee',
    stageDone: '#10b981',
    stageActive: '#06b6d4',
    stagePending: 'rgba(255,255,255,0.09)',
    stageText: 'rgba(255,255,255,0.55)',
    stageActiveText: '#fff',
    boardCardBg: 'rgba(255,255,255,0.04)',
    boardCardBorder: 'rgba(255,255,255,0.07)',
    progressTrack: 'rgba(255,255,255,0.07)',
    glow1: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 68%)',
    glow2: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 68%)',
    glow3: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 68%)',
  } : {
    bg: 'linear-gradient(160deg, #f0f7ff 0%, #e3effe 55%, #d8ecfb 100%)',
    accent: '#0284c7',
    accent2: '#6366f1',
    accent3: '#059669',
    headlineColor: '#0c1a2e',
    subColor: 'rgba(15,40,80,0.52)',
    eyebrow: 'rgba(2,132,199,0.75)',
    badgeBg: 'rgba(2,132,199,0.08)',
    badgeBorder: 'rgba(2,132,199,0.22)',
    badgeColor: '#0284c7',
    footerColor: 'rgba(15,40,80,0.32)',
    cardBg: 'rgba(255,255,255,0.82)',
    cardBorder: 'rgba(2,132,199,0.14)',
    trackBg: 'rgba(2,132,199,0.06)',
    trackGlow: 'rgba(2,132,199,0.14)',
    statVal: '#0c1a2e',
    statLabel: 'rgba(15,40,80,0.48)',
    statRingBg: 'rgba(2,132,199,0.08)',
    meshColor: 'rgba(2,132,199,0.055)',
    particleColor: '#0284c7',
    stageDone: '#059669',
    stageActive: '#0284c7',
    stagePending: 'rgba(2,132,199,0.07)',
    stageText: 'rgba(15,40,80,0.45)',
    stageActiveText: '#fff',
    boardCardBg: 'rgba(255,255,255,0.9)',
    boardCardBorder: 'rgba(2,132,199,0.12)',
    progressTrack: 'rgba(2,132,199,0.09)',
    glow1: 'radial-gradient(circle, rgba(2,132,199,0.12) 0%, transparent 68%)',
    glow2: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 68%)',
    glow3: 'radial-gradient(circle, rgba(5,150,105,0.09) 0%, transparent 68%)',
  }

  // Pipeline stage data
  const PIPELINE_STAGES = [
    { label: 'Intake',    pct: 100, done: true  },
    { label: 'Analysis', pct: 100, done: true  },
    { label: 'Build',    pct: 72,  done: false, active: true },
    { label: 'QA',       pct: 0,   done: false },
    { label: 'Deploy',   pct: 0,   done: false },
  ]
  // Mini project board rows
  const BOARD_ROWS = [
    { name: 'Data Sync Pipeline',   progress: 88, status: 'On track',  statusColor: '#10b981' },
    { name: 'ETL Migration v4',     progress: 61, status: 'At risk',   statusColor: '#f59e0b' },
    { name: 'Reporting Dashboard',  progress: 34, status: 'On track',  statusColor: '#10b981' },
  ]

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
        {/* MOBILE BANNER — new design */}
        <div
          className="flex lg:hidden flex-col"
          style={{
            background: LP.bg,
            position: 'relative',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          {/* Mesh background */}
          <div style={{ position:'absolute', inset:0, pointerEvents:'none',
            backgroundImage: `linear-gradient(${LP.meshColor} 1px, transparent 1px), linear-gradient(90deg, ${LP.meshColor} 1px, transparent 1px)`,
            backgroundSize: '28px 28px', zIndex:0 }} />
          {/* Glow blobs */}
          <div style={{ position:'absolute', top:-60, left:-60, width:200, height:200, background:LP.glow1, filter:'blur(60px)', pointerEvents:'none', zIndex:0, animation:'alp-drift1 12s ease-in-out infinite' }} />
          <div style={{ position:'absolute', bottom:-40, right:-40, width:160, height:160, background:LP.glow2, filter:'blur(50px)', pointerEvents:'none', zIndex:0, animation:'alp-drift2 14s ease-in-out infinite' }} />

          <div style={{ position:'relative', zIndex:2, padding:'28px 24px 16px' }}>
            {/* Eyebrow + badge */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, animation:'alp-fadeUp 0.5s 0.1s ease both' }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.18em', color:LP.eyebrow, textTransform:'uppercase' }}>PROJECT DELIVERY</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:LP.badgeBg, border:`1px solid ${LP.badgeBorder}`, borderRadius:999, padding:'2px 8px', fontSize:9, color:LP.badgeColor }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:LP.accent, display:'inline-block', animation:'alp-pulse 2s infinite' }} /> LIVE
              </span>
            </div>
            {/* Headline */}
            <div style={{ fontSize:20, fontWeight:900, lineHeight:1.18, color:LP.headlineColor, letterSpacing:'-0.5px', animation:'alp-fadeUp 0.5s 0.2s ease both', marginBottom:4 }}>
              Track every project,{' '}
              <span style={{ background:`linear-gradient(90deg, ${LP.accent}, ${LP.accent3})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>end to end.</span>
            </div>
            <div style={{ fontSize:11, color:LP.subColor, lineHeight:1.6, animation:'alp-fadeUp 0.5s 0.3s ease both', marginBottom:14 }}>Real-time pipeline visibility for fast-moving teams.</div>
            {/* Pipeline stage strip */}
            <div style={{ display:'flex', gap:4, animation:'alp-fadeUp 0.5s 0.4s ease both' }}>
              {PIPELINE_STAGES.map((s, i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{
                    width:'100%', height:4, borderRadius:999,
                    background: s.done ? LP.stageDone : s.active ? `linear-gradient(90deg, ${LP.stageActive} ${s.pct}%, ${LP.progressTrack} ${s.pct}%)` : LP.stagePending,
                    boxShadow: s.active ? `0 0 6px ${LP.trackGlow}` : 'none',
                    transition: 'background 0.4s',
                  }} />
                  <span style={{ fontSize:7.5, color: s.active ? LP.stageActive : s.done ? LP.stageDone : LP.stageText, fontWeight: s.active ? 700 : 500, letterSpacing:'0.04em' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Mobile stats strip */}
          <div style={{ display:'flex', gap:6, padding:'12px 24px 16px', borderTop:`1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(2,132,199,0.08)'}`, background: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.65)', zIndex:2, position:'relative' }}>
            {[{val:stat1,label:'Projects',icon:'📦'},{val:stat2,label:'Avg ETA',icon:'⏱'},{val:stat3,label:'On-time',icon:'✓'}].map((s,i) => (
              <div key={i} style={{ flex:1, background:LP.cardBg, border:`1px solid ${LP.cardBorder}`, borderRadius:10, padding:'8px 6px', textAlign:'center', backdropFilter:'blur(8px)' }}>
                <div style={{ fontSize:9, marginBottom:2 }}>{s.icon}</div>
                <div style={{ fontSize:13, fontWeight:800, color:LP.statVal, lineHeight:1 }}>{s.val}</div>
                <div style={{ fontSize:8.5, color:LP.statLabel, marginTop:1, letterSpacing:'0.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* DESKTOP LEFT PANEL — new design */}
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
          {/* ── Background layers ── */}
          {/* Mesh grid */}
          <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0,
            backgroundImage: `linear-gradient(${LP.meshColor} 1px, transparent 1px), linear-gradient(90deg, ${LP.meshColor} 1px, transparent 1px)`,
            backgroundSize: '36px 36px' }} />
          {/* Glow blobs */}
          <div style={{ position:'absolute', top:-120, left:-80, width:400, height:400, background:LP.glow1, filter:'blur(90px)', pointerEvents:'none', zIndex:0, animation:'alp-drift1 16s ease-in-out infinite' }} />
          <div style={{ position:'absolute', bottom:-100, right:-80, width:320, height:320, background:LP.glow2, filter:'blur(80px)', pointerEvents:'none', zIndex:0, animation:'alp-drift2 18s ease-in-out infinite' }} />
          <div style={{ position:'absolute', top:'38%', left:'35%', width:240, height:240, background:LP.glow3, filter:'blur(70px)', pointerEvents:'none', zIndex:0, animation:'alp-drift3 13s ease-in-out infinite' }} />
          {/* Animated data-particle SVG */}
          <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:1 }}>
            <svg width="100%" height="100%">
              {/* Diagonal pipeline connectors */}
              {[
                { x1:'5%',  y1:'15%', x2:'95%', y2:'22%', dur:5 },
                { x1:'5%',  y1:'42%', x2:'95%', y2:'48%', dur:6 },
                { x1:'5%',  y1:'68%', x2:'95%', y2:'73%', dur:7 },
              ].map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke={isDark ? 'rgba(6,182,212,0.12)' : 'rgba(2,132,199,0.1)'}
                  strokeWidth="1" strokeDasharray="5 16"
                  style={{ animation:`alp-flow-dash ${l.dur}s linear infinite`, animationDelay:`${i*0.8}s` }} />
              ))}
              {/* Glowing node dots */}
              {[
                [55,90],[145,155],[95,215],[225,270],[175,155],[310,90],
                [265,215],[350,330],[85,330],[205,90],[330,215],[155,270],
                [420,145],[60,340],[390,270]
              ].map(([cx,cy],i) => (
                <circle key={i} cx={`${cx}`} cy={`${cy}`} r="2.8"
                  fill={i % 3 === 0 ? LP.accent : i % 3 === 1 ? LP.accent2 : LP.accent3}
                  opacity={isDark ? 0.5 : 0.35}
                  style={{ animation:'alp-node-pulse 3s ease-in-out infinite', animationDelay:`${i*0.22}s`, transformOrigin:`${cx}px ${cy}px` }} />
              ))}
              {/* Travelling data packets */}
              {[0,1,2,3,4].map(i => (
                <circle key={i} r="2.2" fill={LP.particleColor} opacity="0.65"
                  style={{ animation:`alp-flow-dash ${2.8 + i * 0.6}s linear infinite`, animationDelay:`${i * 0.55}s` }}>
                  <animate attributeName="cx" values="20;480" dur={`${2.8 + i*0.6}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${80 + i*55};${130 + i*55}`} dur={`${2.8 + i*0.6}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </svg>
          </div>

          {/* ── TOP SECTION ── */}
          <div style={{ position:'relative', zIndex:2 }}>
            {/* Eyebrow */}
            <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'0.2em', color:LP.eyebrow, textTransform:'uppercase', marginBottom:14, animation:'alp-fadeUp 0.6s 0.15s ease both', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:18, height:1.5, background:LP.accent, display:'inline-block', borderRadius:999 }} />
              PROJECT DELIVERY PLATFORM
              <span style={{ width:18, height:1.5, background:LP.accent, display:'inline-block', borderRadius:999 }} />
            </div>
            {/* Live badge */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:LP.badgeBg, border:`1px solid ${LP.badgeBorder}`, borderRadius:999, padding:'4px 12px', fontSize:10, color:LP.badgeColor, marginBottom:20, animation:'alp-fadeUp 0.6s 0.22s ease both' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:LP.accent, display:'inline-block', animation:'alp-pulse 2s infinite' }} />
              All pipelines operational
            </div>
            {/* Headline */}
            <div style={{ fontSize:34, fontWeight:900, lineHeight:1.15, letterSpacing:'-1px', color:LP.headlineColor, animation:'alp-fadeUp 0.6s 0.3s ease both' }}>
              <div>Track every project.</div>
              <div style={{ marginTop:2 }}>
                <span style={{ background:`linear-gradient(100deg, ${LP.accent}, ${LP.accent3})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Deliver with confidence.</span>
              </div>
            </div>
            {/* Sub */}
            <div style={{ fontSize:13, color:LP.subColor, lineHeight:1.75, maxWidth:290, marginTop:12, animation:'alp-fadeUp 0.6s 0.42s ease both' }}>
              End-to-end pipeline visibility — from intake to deployment — for data teams that never miss a deadline.
            </div>

            {/* ── PIPELINE STAGE VISUALIZER ── */}
            <div style={{ marginTop:28, animation:'alp-fadeUp 0.6s 0.52s ease both' }}>
              {/* Stage track */}
              <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:8 }}>
                {PIPELINE_STAGES.map((s, i) => (
                  <React.Fragment key={i}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flex:1 }}>
                      {/* Circle indicator */}
                      <div style={{
                        width: s.active ? 30 : 22,
                        height: s.active ? 30 : 22,
                        borderRadius:'50%',
                        background: s.done
                          ? LP.stageDone
                          : s.active
                            ? `conic-gradient(${LP.stageActive} ${s.pct * 3.6}deg, ${LP.progressTrack} 0deg)`
                            : LP.stagePending,
                        border: s.active ? `2.5px solid ${LP.stageActive}` : s.done ? `2px solid ${LP.stageDone}` : `1.5px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(2,132,199,0.15)'}`,
                        boxShadow: s.active ? `0 0 12px ${LP.trackGlow}` : s.done ? `0 0 8px rgba(16,185,129,0.3)` : 'none',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        transition:'all 0.4s',
                        animation: s.active ? 'alp-node-pulse 2.5s ease-in-out infinite' : 'none',
                        position:'relative',
                      }}>
                        {s.done && <span style={{ color:'#fff', fontSize:11, fontWeight:800, lineHeight:1 }}>✓</span>}
                        {s.active && <span style={{ color:LP.stageActive, fontSize:9, fontWeight:800 }}>{s.pct}%</span>}
                        {!s.done && !s.active && <span style={{ width:5, height:5, borderRadius:'50%', background:LP.stageText, display:'inline-block' }} />}
                      </div>
                      {/* Label */}
                      <span style={{ fontSize:8.5, fontWeight: s.active ? 700 : 500, color: s.active ? LP.stageActive : s.done ? LP.stageDone : LP.stageText, letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{s.label}</span>
                    </div>
                    {/* Connector line */}
                    {i < PIPELINE_STAGES.length - 1 && (
                      <div style={{ height:2, flex:0.4, marginBottom:16, borderRadius:999, background: (PIPELINE_STAGES[i+1].done || PIPELINE_STAGES[i+1].active) ? `linear-gradient(90deg, ${LP.stageDone}, ${LP.stageActive})` : LP.progressTrack, transition:'background 0.4s' }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* ── LIVE METRICS + PROJECT BOARD CARD ── */}
          <div
            style={{
              position:'relative', zIndex:2,
              background: isDark ? 'rgba(6,182,212,0.04)' : LP.cardBg,
              border: `1px solid ${LP.cardBorder}`,
              borderRadius:16, padding:'18px 20px',
              marginTop:28, backdropFilter:'blur(24px)',
              boxShadow: isDark ? `0 4px 36px rgba(6,182,212,0.07)` : `0 4px 24px rgba(2,132,199,0.06)`,
              animation:'alp-fadeUp 0.6s 0.65s ease both, alp-cardGlow 5s 2s ease-in-out infinite',
            }}
          >
            {/* Card header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <span style={{ fontSize:9, letterSpacing:'0.15em', color:LP.statLabel, textTransform:'uppercase', fontWeight:600 }}>LIVE PROJECT BOARD</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:8.5, color:'#4ade80', background:'rgba(74,222,128,0.09)', border:'1px solid rgba(74,222,128,0.18)', borderRadius:999, padding:'2px 7px' }}>
                <span style={{ width:4.5, height:4.5, borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'alp-pulse 2s infinite' }} /> LIVE
              </span>
            </div>
            {/* Stat pills row */}
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {[
                { val:stat1, label:'Projects', color:LP.accent },
                { val:stat2, label:'Avg ETA',  color:LP.accent2 },
                { val:stat3, label:'On-time',  color:LP.accent3 },
              ].map((s, i) => (
                <div key={i} style={{ flex:1, background:LP.statRingBg, border:`1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(2,132,199,0.1)'}`, borderRadius:10, padding:'10px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:17, fontWeight:900, color:s.color, lineHeight:1, letterSpacing:'-0.5px' }}>{s.val}</div>
                  <div style={{ fontSize:9, color:LP.statLabel, marginTop:3, letterSpacing:'0.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Mini project board rows */}
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {BOARD_ROWS.map((row, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, background:LP.boardCardBg, border:`1px solid ${LP.boardCardBorder}`, borderRadius:9, padding:'8px 11px', animation:`alp-fadeUp 0.5s ${0.7 + i*0.1}s ease both` }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10.5, fontWeight:600, color:LP.statVal, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:4 }}>{row.name}</div>
                    <div style={{ height:3.5, borderRadius:999, background:LP.progressTrack, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${row.progress}%`, borderRadius:999, background:`linear-gradient(90deg, ${LP.accent}, ${LP.accent3})`, boxShadow:`0 0 6px ${LP.trackGlow}`, animation:'alp-shimmer 3s 1s linear infinite', backgroundSize:'200% auto' }} />
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, flexShrink:0 }}>
                    <span style={{ fontSize:9.5, fontWeight:700, color:LP.statVal }}>{row.progress}%</span>
                    <span style={{ fontSize:8, color:row.statusColor, background:`${row.statusColor}18`, borderRadius:999, padding:'1px 6px', fontWeight:600 }}>{row.status}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Updated footer */}
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:5, fontSize:8.5, color:LP.statLabel }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'#4ade80', display:'inline-block', animation:'alp-pulse 2s infinite' }} />
              Updated just now · {new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })}
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ position:'relative', zIndex:2, fontSize:10, color:LP.footerColor, display:'flex', alignItems:'center', gap:8, marginTop:24 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:LP.accent, boxShadow:`0 0 6px ${LP.accent}88` }} />
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
