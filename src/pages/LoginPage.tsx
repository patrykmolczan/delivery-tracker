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

/* ── Shared design tokens ── */
const LP = {
  bg: 'linear-gradient(145deg, #060b18 0%, #0a1628 45%, #0b1e3a 100%)',
  headlineColor: '#f0f8ff',
  subColor: 'rgba(180,210,255,0.55)',
  badgeBg: 'rgba(14,165,233,0.12)',
  badgeBorder: 'rgba(14,165,233,0.3)',
  badgeColor: '#38bdf8',
  cardBg: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.08)',
  footerColor: 'rgba(255,255,255,0.22)',
  nodeLine: 'rgba(14,165,233,0.35)',
  nodeGlow: '#0ea5e9',
}

const GRAD_TEXT: React.CSSProperties = {
  background: `linear-gradient(90deg, #38bdf8, #2dd4bf)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

/* ── Sub-components ── */

const LiveDot = ({ size = 6 }: { size?: number }) => (
  <span style={{ width: size, height: size, background: '#4ade80', borderRadius: '50%', display: 'inline-block', flexShrink: 0, animation: 'alp-pulse 2s infinite' }} />
)

const GridOverlay = ({ size = 28 }: { size?: number }) => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    backgroundImage: `linear-gradient(rgba(99,179,237,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,179,237,0.06) 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`, overflow: 'hidden',
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

const StatPill = ({ val, label, icon }: { val: string; label: string; icon?: React.ReactNode }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(14,165,233,0.08)',
    border: '1px solid rgba(14,165,233,0.18)',
    borderRadius: 8,
    padding: '10px 12px',
    minWidth: 64,
    flex: 1,
    textAlign: 'center',
  }}>
    {icon && (
      <span style={{ fontSize: 14, marginBottom: 2, lineHeight: 1 }}>{icon}</span>
    )}
    <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f8ff', lineHeight: 1.1 }}>{val}</div>
    <div style={{ fontSize: 9, color: 'rgba(180,210,255,0.5)', marginTop: 1 }}>{label}</div>
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
        {isDark ? <LightModeRounded sx={{ fontSize: 18 }} /> : <DarkModeRounded sx={{ fontSize: 18 }} />}
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
          <Blob w={200} h={200} color="radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)" top={-60} left={-60} opacity={1} anim="alp-drift1 10s ease-in-out infinite" blur={60} />
          <Blob w={160} h={160} color="radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)" bottom={-30} right={-30} opacity={1} anim="alp-drift2 12s ease-in-out infinite" blur={60} />
          <GridOverlay size={28} />

          <div style={{ position: 'relative', zIndex: 2, padding: '28px 24px 18px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: LP.badgeBg, border: `1px solid ${LP.badgeBorder}`, borderRadius: 999, padding: '3px 10px', fontSize: 10, color: LP.badgeColor, marginBottom: 12, animation: 'alp-fadeUp 0.5s 0.2s ease both' }}>
              <LiveDot /> All systems operational
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: LP.headlineColor, marginBottom: 6, animation: 'alp-fadeUp 0.5s 0.35s ease both' }}>
              Data.{' '}
              <span style={GRAD_TEXT}>Intelligence.</span>{' '}
              Delivered.
            </div>
            <div style={{ fontSize: 11, color: LP.subColor, lineHeight: 1.5, animation: 'alp-fadeUp 0.5s 0.5s ease both' }}>
              Real-time pipeline visibility for fast-moving teams.
            </div>
          </div>

          {/* Mobile stats strip */}
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', position: 'relative', zIndex: 2, animation: 'alp-fadeIn 0.5s 0.6s ease both', gap: 8, padding: '0 8px' }}>
            <StatPill val={stat1} label="Projects tracked" icon={<Inventory2Rounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
            <StatPill val={stat2} label="Avg ETA delta" icon={<TimerRounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
            <StatPill val={stat3} label="On-time rate" icon={<TaskAltRounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
          </div>
        </div>

        {/* ══════════════════════════════
            DESKTOP LEFT PANEL
        ══════════════════════════════ */}
        <div className="hidden lg:flex flex-col justify-between flex-1 overflow-hidden"
          style={{ position:'relative', background: LP.bg, padding:'40px 36px' }}>

          {/* === BACKGROUND LAYER === */}
          {/* Ambient blobs — keep alp-drift1/2/3 keyframes */}
          <Blob w={300} h={300} color="radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)" top={-80} left={-80} opacity={1} anim="alp-drift1 12s ease-in-out infinite" blur={80} />
          <Blob w={240} h={240} color="radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)" bottom={-60} right={-60} opacity={1} anim="alp-drift2 14s ease-in-out infinite" blur={80} />
          <Blob w={180} h={180} color="radial-gradient(circle, rgba(13,148,136,0.12) 0%, transparent 70%)" top="45%" left="50%" opacity={1} anim="alp-drift3 10s ease-in-out infinite" blur={60} />
          <GridOverlay size={28} />

          {/* === SCAN LINE (DaaS feel) === */}
          <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:1 }}>
            <div style={{ position:'absolute', left:0, right:0, height:120,
              background:'linear-gradient(to bottom, transparent 0%, rgba(14,165,233,0.04) 50%, transparent 100%)',
              animation:'alp-scan-line 8s linear infinite' }} />
          </div>

          {/* === DATA FLOW SVG === */}
          {/* Centered between top section and stats card */}
          <div style={{ position:'absolute', inset:0, zIndex:1, pointerEvents:'none' }}>
            <svg width="100%" height="100%" style={{ opacity:0.55 }}>
              {/* Three horizontal dashed lines suggesting data pipeline */}
              {[140, 200, 260].map((y, i) => (
                <line key={i} x1="-20" y1={y} x2="120%" y2={y}
                  stroke={LP.nodeLine} strokeWidth="1"
                  strokeDasharray="4 10"
                  style={{ animation: `alp-flow-dash ${3 + i * 0.8}s linear infinite`, animationDelay: `${i * 0.4}s` }} />
              ))}
              {/* Node dots at intersections */}
              {[[60,140],[160,200],[100,260],[220,140],[280,200]].map(([cx,cy],i) => (
                <circle key={i} cx={cx} cy={cy} r={3}
                  fill={LP.nodeGlow}
                  style={{ animation: `alp-node-pulse 2.5s ease-in-out infinite`, animationDelay: `${i * 0.35}s`, transformOrigin:`${cx}px ${cy}px` }} />
              ))}
            </svg>
          </div>

          {/* === TOP SECTION === */}
          <div style={{ position:'relative', zIndex:2 }}>
            {/* Status badge */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:6,
              background: LP.badgeBg, border:`1px solid ${LP.badgeBorder}`,
              borderRadius:999, padding:'4px 12px', fontSize:11, color: LP.badgeColor,
              marginBottom:28, animation:'alp-fadeUp 0.6s 0.2s ease both' }}>
              <LiveDot /> All systems operational
            </div>

            {/* Eyebrow label */}
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.14em', textTransform:'uppercase',
              color:'rgba(56,189,248,0.7)', marginBottom:10, animation:'alp-fadeUp 0.6s 0.28s ease both' }}>
              Data as a Service
            </div>

            {/* Headline — 3-line stacked */}
            <div style={{ fontSize:28, fontWeight:800, lineHeight:1.2, color: LP.headlineColor,
              marginBottom:14, animation:'alp-fadeUp 0.6s 0.35s ease both', letterSpacing:'-0.5px' }}>
              Data.{' '}
              <span style={{ background:'linear-gradient(90deg, #38bdf8, #2dd4bf)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Intelligence.</span>{' '}
              Delivered.
            </div>

            {/* Sub headline */}
            <div style={{ fontSize:12, color: LP.subColor, lineHeight:1.7, maxWidth:270,
              animation:'alp-fadeUp 0.6s 0.48s ease both' }}>
              Real-time pipeline visibility from intake to delivery — for teams that move fast.
            </div>

            {/* Feature chips row — 3 small pills */}
            <div style={{ display:'flex', gap:6, marginTop:20, flexWrap:'wrap', animation:'alp-fadeUp 0.6s 0.58s ease both' }}>
              {[
                { icon: <BoltRounded sx={{ color: '#fff', fontSize: 12, verticalAlign: 'middle' }} />, label: 'Live tracking' },
                { icon: <LockRounded sx={{ color: '#fff', fontSize: 12, verticalAlign: 'middle' }} />, label: 'Enterprise SSO' },
                { icon: <InsightsRounded sx={{ color: '#fff', fontSize: 12, verticalAlign: 'middle' }} />, label: 'DaaS analytics' }
              ].map((item,i) => (
                <span key={i} style={{ fontSize:10, fontWeight:500,
                  padding:'3px 9px', borderRadius:999,
                  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)',
                  color:'rgba(200,230,255,0.65)', letterSpacing:'0.02em' }}>
                  <>{item.icon} {item.label}</>
                </span>
              ))}
            </div>
          </div>

          {/* === STATS CARD (redesigned) === */}
          <div style={{ position:'relative', zIndex:2,
            background:'rgba(255,255,255,0.035)', border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:14, padding:'16px 18px', backdropFilter:'blur(16px)',
            animation:'alp-fadeUp 0.6s 0.7s ease both, alp-cardGlow 4s 1.5s ease-in-out infinite' }}>
            {/* Card header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <span style={{ fontSize:10, color:'rgba(180,210,255,0.4)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Live platform metrics</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:9,
                color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)',
                borderRadius:999, padding:'2px 7px' }}>
                <LiveDot size={5} /> LIVE
              </span>
            </div>
            {/* Three stat pills */}
            <div style={{ display:'flex', gap:8 }}>
              <StatPill val={stat1} label="Projects tracked" icon={<Inventory2Rounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
              <StatPill val={stat2} label="Avg ETA delta" icon={<TimerRounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
              <StatPill val={stat3} label="On-time rate" icon={<TaskAltRounded sx={{ fontSize: 13, color: isDark ? '#fff' : undefined }} />} />
            </div>
            {/* Mini sparkline bar visual (purely decorative) */}
            <div style={{ marginTop:14, display:'flex', gap:2, alignItems:'flex-end', height:20 }}>
              {[40,65,50,80,60,90,75,100,85,95,70,88].map((h,i) => (
                <div key={i} style={{ flex:1, height:`${h}%`, borderRadius:2,
                  background:`linear-gradient(to top, rgba(14,165,233,0.6), rgba(45,212,191,0.4))`,
                  animation:`alp-data-float ${2.5 + (i % 3) * 0.5}s ease-in-out infinite`,
                  animationDelay:`${i * 0.12}s` }} />
              ))}
            </div>
          </div>

          {/* === FOOTER === */}
          <div style={{ position:'relative', zIndex:2, fontSize:10, color: LP.footerColor,
            animation:'alp-fadeIn 0.8s 1s ease both', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%',
              background:'rgba(14,165,233,0.4)', boxShadow:'0 0 6px rgba(14,165,233,0.5)' }} />
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
                  {loading ? <AutorenewRounded sx={{ fontSize: 17 }} className="animate-spin" /> : <VpnKeyRounded sx={{ fontSize: 17 }} />}
                  {loading ? 'Redirecting to Okta…' : 'Sign in with Okta SSO'}
                </button>
                {error && (
                  <div className="alert alert-error py-2">
                    <ErrorOutlineRounded sx={{ fontSize: 18 }} /><span className="text-sm">{error}</span>
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
                    <ErrorOutlineRounded sx={{ fontSize: 18 }} /><span className="text-sm">{error}</span>
                  </div>
                )}

                <button type="submit" style={{ ...btnStyle, marginTop: 16 }} disabled={loading}>
                  {loading ? <AutorenewRounded sx={{ fontSize: 17 }} className="animate-spin" /> : null}
                  {loading ? 'Signing in...' : 'Sign in'}
                  {!loading && <ArrowForwardRounded sx={{ fontSize: 17 }} />}
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
                      <VpnKeyRounded sx={{ fontSize: 17 }} />
                      Sign in with Okta SSO
                    </button>
                  </>
                )}

                {/* Back to SSO */}
                {ssoEnabled && showPasswordFallback && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <button type="button" onClick={() => { setShowPasswordFallback(false); setError(null) }}
                      style={{ fontSize: 12, color: rp.footer, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, transition: 'color 0.35s' }}>
                      <ArrowBackRounded sx={{ fontSize: 14 }} /> Back to Okta SSO login
                    </button>
                  </div>
                )}
              </form>
            )}

            <p style={{ fontSize: 12, color: rp.footer, textAlign: 'center', marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'color 0.35s', animation: 'alp-fadeIn 0.6s 1s ease both' }}>
              <LockRounded sx={{ fontSize: 14, opacity: 0.7 }} /> Protected by enterprise-grade security
            </p>
          </div>
        </div>

      </div>
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
