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
    bg: 'linear-gradient(145deg, #060b18 0%, #0a1628 45%, #0b1e3a 100%)',
    headlineColor: '#f0f8ff',
    subColor: 'rgba(180,210,255,0.55)',
    badgeBg: 'rgba(14,165,233,0.12)',
    badgeBorder: 'rgba(14,165,233,0.3)',
    badgeColor: '#38bdf8',
    footerColor: 'rgba(255,255,255,0.22)',
    nodeLine: 'rgba(14,165,233,0.35)',
    nodeGlow: '#0ea5e9',
    statVal: '#f0f8ff',
    statLabel: 'rgba(180,210,255,0.5)',
    statIcon: '#fff' as string,
    statBg: 'rgba(14,165,233,0.08)',
    statBorder: '1px solid rgba(14,165,233,0.18)',
    cardBg: 'rgba(255,255,255,0.035)',
    cardBorder: '1px solid rgba(255,255,255,0.08)',
    liveMetricsLabel: 'rgba(180,210,255,0.4)',
    sparkTop: 'rgba(14,165,233,0.6)',
    sparkBot: 'rgba(45,212,191,0.4)',
    eyebrow: 'rgba(56,189,248,0.7)',
    chipBg: 'rgba(255,255,255,0.05)',
    chipBorder: '1px solid rgba(255,255,255,0.09)',
    chipColor: 'rgba(200,230,255,0.65)',
    chipIconColor: '#fff' as string,
    blob1: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
    blob2: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
    blob3: 'radial-gradient(circle, rgba(13,148,136,0.12) 0%, transparent 70%)',
    gridColor: 'rgba(99,179,237,0.06)',
    liveFooterDot: 'rgba(14,165,233,0.4)',
    liveFooterGlow: 'rgba(14,165,233,0.5)',
  } : {
    bg: 'linear-gradient(145deg, #f0f7ff 0%, #e4eef9 45%, #daedfb 100%)',
    headlineColor: '#0f172a',
    subColor: 'rgba(15,23,42,0.55)',
    badgeBg: 'rgba(14,165,233,0.09)',
    badgeBorder: 'rgba(14,165,233,0.25)',
    badgeColor: '#0284c7',
    footerColor: 'rgba(15,23,42,0.35)',
    nodeLine: 'rgba(14,165,233,0.28)',
    nodeGlow: '#0284c7',
    statVal: '#0f172a',
    statLabel: 'rgba(15,23,42,0.5)',
    statIcon: '#0284c7' as string,
    statBg: 'rgba(14,165,233,0.07)',
    statBorder: '1px solid rgba(14,165,233,0.15)',
    cardBg: 'rgba(255,255,255,0.75)',
    cardBorder: '1px solid rgba(14,165,233,0.12)',
    liveMetricsLabel: 'rgba(15,23,42,0.4)',
    sparkTop: 'rgba(14,165,233,0.5)',
    sparkBot: 'rgba(45,212,191,0.35)',
    eyebrow: 'rgba(2,132,199,0.8)',
    chipBg: 'rgba(14,165,233,0.06)',
    chipBorder: '1px solid rgba(14,165,233,0.14)',
    chipColor: 'rgba(15,23,42,0.65)',
    chipIconColor: '#0284c7' as string,
    blob1: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)',
    blob2: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)',
    blob3: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 70%)',
    gridColor: 'rgba(14,165,233,0.05)',
    liveFooterDot: 'rgba(14,165,233,0.5)',
    liveFooterGlow: 'rgba(14,165,233,0.6)',
  }

  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [ssoDomain, setSsoDomain] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [flowStep, setFlowStep] = useState(0)
  useEffect(() => {
    const ft = setInterval(() => setFlowStep(s => (s + 1) % 3), 2200)
    return () => clearInterval(ft)
  }, [])

  useInjectAuroraKeyframes()


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
              ? 'linear-gradient(160deg, #020c1b 0%, #041428 60%, #051a35 100%)'
              : 'linear-gradient(160deg, #e8f4fd 0%, #dbeafe 60%, #cfe9fb 100%)',
            position: 'relative',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          {/* Glow blobs */}
          <Blob w={220} h={220} color={LP.blob1} top={-70} left={-70} opacity={1} anim="alp-drift1 12s ease-in-out infinite" blur={70} />
          <Blob w={170} h={170} color={LP.blob2} bottom={-40} right={-40} opacity={1} anim="alp-drift2 14s ease-in-out infinite" blur={70} />
          <GridOverlay size={32} color={LP.gridColor} />

          <div style={{ position: 'relative', zIndex: 2, padding: '32px 24px 20px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: LP.badgeBg,
                border: `1px solid ${LP.badgeBorder}`,
                borderRadius: 999,
                padding: '3px 10px',
                fontSize: 10,
                color: LP.badgeColor,
                marginBottom: 14,
                animation: 'alp-fadeUp 0.5s 0.18s ease both',
              }}
            >
              <LiveDot /> All systems operational
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: LP.headlineColor,
                marginBottom: 6,
                lineHeight: 1.18,
                animation: 'alp-fadeUp 0.5s 0.28s ease both',
              }}
            >
              Data.{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #22d3ee, #2dd4bf)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Intelligence.
              </span>{' '}
              Delivered.
            </div>
            <div
              style={{
                fontSize: 12,
                color: LP.subColor,
                lineHeight: 1.6,
                animation: 'alp-fadeUp 0.5s 0.38s ease both',
              }}
            >
              End-to-end project tracking and delivery platform — from intake to completion.
            </div>
          </div>

          {/* Mobile process flow strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              padding: '14px 20px 18px',
              borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              background: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.6)',
              zIndex: 2,
              position: 'relative',
            }}
          >
            {[
              { label: 'Requested', step: 0, icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              )},
              { label: 'Analysis', step: 1, icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              )},
              { label: 'Delivery', step: 2, icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              )},
            ].map(({ label, step, icon }, idx) => {
              const isActive = flowStep === step;
              const isDone = flowStep > step;
              const nodeColor = isActive
                ? '#22d3ee'
                : isDone
                ? '#2dd4bf'
                : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)');
              return (
                <React.Fragment key={step}>
                  {idx > 0 && (
                    <div style={{ flex: 1, height: 1, position: 'relative', overflow: 'hidden', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%',
                        width: isDone ? '100%' : isActive ? '50%' : '0%',
                        background: 'linear-gradient(90deg, #22d3ee, #2dd4bf)',
                        transition: 'width 0.6s ease',
                      }} />
                      {isActive && (
                        <div style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                          width: 5, height: 5, borderRadius: '50%',
                          background: '#22d3ee',
                          boxShadow: '0 0 6px #22d3ee',
                          animation: 'alp-travel 1.1s linear infinite',
                        }} />
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      border: `1.5px solid ${nodeColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: nodeColor,
                      background: isActive
                        ? (isDark ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.1)')
                        : 'transparent',
                      boxShadow: isActive ? `0 0 10px rgba(34,211,238,0.35)` : 'none',
                      transition: 'all 0.4s ease',
                    }}>
                      {icon}
                    </div>
                    <span style={{
                      fontSize: 9,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? LP.headlineColor : LP.subColor,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      transition: 'color 0.3s',
                    }}>{label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* DESKTOP LEFT PANEL */}
        <div
          className="hidden lg:flex flex-col justify-between"
          style={{
            flex: 1,
            minHeight: 560,
            position: 'relative',
            background: isDark
              ? 'linear-gradient(150deg, #020c1b 0%, #041428 50%, #061930 100%)'
              : 'linear-gradient(150deg, #e8f4fd 0%, #dbeafe 60%, #cfe9fb 100%)',
            padding: '48px 44px',
            transition: 'background 0.4s',
            overflow: 'hidden',
          }}
        >
          {/* BG layers */}
          <GridOverlay size={32} color={LP.gridColor} />
          <Blob w={350} h={350} color={LP.blob1} top={-100} left={-100} opacity={1} anim="alp-drift1 14s ease-in-out infinite" blur={100} />
          <Blob w={280} h={280} color={LP.blob2} bottom={-80} right={-80} opacity={1} anim="alp-drift2 16s ease-in-out infinite" blur={90} />
          <Blob w={200} h={200} color={LP.blob3} top="40%" left="45%" opacity={1} anim="alp-drift3 11s ease-in-out infinite" blur={70} />
          {/* Scan line */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 160,
              background: 'linear-gradient(to bottom, transparent, rgba(6,182,212,0.05) 50%, transparent)',
              animation: 'alp-scan-line 10s linear infinite',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          {/* Data flow SVG */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <svg width="100%" height="100%" style={{ opacity: 0.6 }}>
              {/* 5 horizontal dashed lines */}
              {[100,165,230,295,360].map((y, i) => (
                <line
                  key={i}
                  x1="2%"
                  y1={y}
                  x2="98%"
                  y2={y}
                  stroke={LP.nodeLine}
                  strokeWidth="1"
                  strokeDasharray="6 14"
                  style={{
                    animation: `alp-flow-dash ${3 + i}s linear infinite`,
                    animationDelay: `${i * 0.3}s`,
                  }}
                />
              ))}
              {/* 12 node circles */}
              {[
                [50,100],[140,165],[90,230],[220,295],[170,165],[300,100],
                [260,230],[340,360],[80,360],[200,100],[320,230],[150,295]
              ].map(([cx,cy],i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  fill={LP.nodeGlow}
                  style={{
                    animation: 'alp-node-pulse 2.8s ease-in-out infinite',
                    animationDelay: `${i * 0.25}s`,
                    transformOrigin: `${cx}px ${cy}px`,
                  }}
                />
              ))}
              {/* 4 data packets */}
              {[0,1,2,3].map(i => (
                <circle
                  key={i}
                  r={2}
                  fill="#22d3ee"
                  opacity={0.7}
                  style={{
                    animation: `alp-flow-dash ${2.5 + i * 0.7}s linear infinite`,
                    animationDelay: `${i * 0.5}s`,
                  }}
                >
                  <animate
                    attributeName="cx"
                    values="50;340"
                    dur={`${2.5 + i * 0.7}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="cy"
                    values="100;360"
                    dur={`${2.5 + i * 0.7}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </svg>
          </div>
          {/* TOP SECTION */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {/* Eyebrow */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.18em',
                color: LP.eyebrow,
                textTransform: 'uppercase',
                marginBottom: 16,
                animation: 'alp-fadeUp 0.6s 0.2s ease both',
              }}
            >
              DATA AS A SERVICE
            </div>
            {/* Status badge */}
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
                marginBottom: 24,
                animation: 'alp-fadeUp 0.6s 0.25s ease both',
              }}
            >
              <LiveDot /> All systems operational
            </div>
            {/* Headline */}
            <div
              style={{
                fontSize: 36,
                fontWeight: 900,
                lineHeight: 1.15,
                letterSpacing: '-1px',
                color: LP.headlineColor,
                animation: 'alp-fadeUp 0.6s 0.32s ease both',
              }}
            >
              <div>Data.</div>
              <div>
                <span
                  style={{
                    background: 'linear-gradient(90deg, #22d3ee, #2dd4bf)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Intelligence.
                </span>
              </div>
              <div>Delivered.</div>
            </div>
            {/* Sub */}
            <div
              style={{
                fontSize: 13,
                color: LP.subColor,
                lineHeight: 1.75,
                maxWidth: 280,
                marginTop: 14,
                animation: 'alp-fadeUp 0.6s 0.45s ease both',
              }}
            >
              End-to-end project tracking and delivery platform — from intake to completion.
            </div>
            {/* Feature chips */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 24,
                animation: 'alp-fadeUp 0.6s 0.55s ease both',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: LP.chipBg,
                  border: LP.chipBorder,
                  color: LP.chipColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  letterSpacing: '0.02em',
                  transition: 'background 0.35s, color 0.35s, border-color 0.35s',
                }}
              >
                <BoltRounded sx={{ color: LP.chipIconColor, fontSize: 14, verticalAlign: 'middle' }} /> Live tracking
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: LP.chipBg,
                  border: LP.chipBorder,
                  color: LP.chipColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  letterSpacing: '0.02em',
                  transition: 'background 0.35s, color 0.35s, border-color 0.35s',
                }}
              >
                <LockRounded sx={{ color: LP.chipIconColor, fontSize: 14, verticalAlign: 'middle' }} /> Enterprise SSO
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: LP.chipBg,
                  border: LP.chipBorder,
                  color: LP.chipColor,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  letterSpacing: '0.02em',
                  transition: 'background 0.35s, color 0.35s, border-color 0.35s',
                }}
              >
                <InsightsRounded sx={{ color: LP.chipIconColor, fontSize: 14, verticalAlign: 'middle' }} /> DaaS analytics
              </span>
            </div>
          </div>
          {/* PROCESS FLOW CARD */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              background: isDark ? 'rgba(6,182,212,0.05)' : 'rgba(255,255,255,0.8)',
              border: isDark ? '1px solid rgba(6,182,212,0.15)' : '1px solid rgba(6,182,212,0.18)',
              borderRadius: 16,
              padding: '20px 20px 18px',
              marginTop: 36,
              backdropFilter: 'blur(20px)',
              animation: 'alp-fadeUp 0.6s 0.68s ease both, alp-cardGlow 4.5s 1.5s ease-in-out infinite',
              boxShadow: isDark ? '0 4px 32px rgba(6,182,212,0.08)' : '0 4px 24px rgba(6,182,212,0.06)',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.14em', color: LP.liveMetricsLabel, textTransform: 'uppercase' as const, transition: 'color 0.35s' }}>
                DELIVERY PIPELINE
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 999, padding: '2px 7px' }}>
                <LiveDot size={5} /> LIVE
              </span>
            </div>
            {/* Flow nodes row */}
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {([
                { label: 'Requested', color: '#22d3ee', glow: 'rgba(34,211,238,0.3)', icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                    <line x1="9" y1="16" x2="13" y2="16"/>
                  </svg>
                )},
                { label: 'Analysis', color: '#818cf8', glow: 'rgba(129,140,248,0.3)', icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                    <circle cx="11" cy="11" r="7"/>
                    <path d="M21 21l-4.35-4.35"/>
                    <line x1="11" y1="8" x2="11" y2="14"/>
                    <line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                )},
                { label: 'Delivery', color: '#34d399', glow: 'rgba(52,211,153,0.3)', icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                )},
              ] as Array<{ label: string; color: string; glow: string; icon: React.ReactNode }>).map((node, i) => (
                <React.Fragment key={i}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                    <div style={{
                      width: 46,
                      height: 46,
                      borderRadius: 13,
                      border: `1.5px solid ${flowStep >= i ? node.color : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}`,
                      background: flowStep >= i
                        ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)')
                        : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: flowStep >= i ? node.color : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'),
                      transition: 'all 0.7s ease',
                      boxShadow: flowStep === i ? `0 0 18px ${node.glow}` : 'none',
                      animation: flowStep === i ? 'alp-node-pulse 2s ease-in-out infinite' : 'none',
                    }}>
                      {node.icon}
                    </div>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      color: flowStep >= i
                        ? (isDark ? '#e2e8f0' : '#1e293b')
                        : (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'),
                      transition: 'color 0.7s',
                      whiteSpace: 'nowrap' as const,
                    }}>
                      {node.label}
                    </div>
                    <div style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: flowStep === i ? node.color : 'transparent',
                      boxShadow: flowStep === i ? `0 0 7px ${node.color}` : 'none',
                      transition: 'all 0.5s',
                      animation: flowStep === i ? 'alp-pulse 1.2s infinite' : 'none',
                    }} />
                  </div>
                  {i < 2 && (
                    <div style={{ flex: 1, position: 'relative', height: 2, margin: '22px 8px 0' }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 1, background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)' }} />
                      <div style={{
                        position: 'absolute', top: 0, left: 0, bottom: 0,
                        width: flowStep > i ? '100%' : '0%',
                        borderRadius: 1,
                        background: i === 0 ? 'linear-gradient(to right,#22d3ee,#818cf8)' : 'linear-gradient(to right,#818cf8,#34d399)',
                        transition: 'width 0.9s ease',
                      }} />
                      {flowStep === i && (
                        <div style={{
                          position: 'absolute', top: '50%', marginTop: -3,
                          width: 6, height: 6, borderRadius: '50%',
                          background: i === 0 ? '#818cf8' : '#34d399',
                          boxShadow: `0 0 10px ${i === 0 ? '#818cf8' : '#34d399'}`,
                          animation: 'alp-travel 1.4s linear infinite',
                        }} />
                      )}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* Status line */}
            <div style={{ marginTop: 16, fontSize: 10, color: LP.liveMetricsLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'alp-pulse 2s infinite' }} />
              {(['Intake received — queued for analysis', 'AI analysis in progress…', 'Delivery complete ✓'] as const)[flowStep]}
            </div>
          </div>
                    {/* FOOTER */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              fontSize: 10,
              color: LP.footerColor,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 32,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: LP.liveFooterDot,
                boxShadow: `0 0 6px ${LP.liveFooterGlow}`,
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
@keyframes alp-travel {
  0%   { left: 0%; }
  100% { left: calc(100% - 6px); }
}
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
