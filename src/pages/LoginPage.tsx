import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, AlertCircle, KeyRound } from 'lucide-react'
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
  // When SSO is the default mode, user can click "Sign in with email instead" to reveal password form
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

  // SSO mode: show SSO button as primary; password hidden behind fallback link
  const showSSO = ssoEnabled && settingsLoaded && !showPasswordFallback
  // Password mode: show email/password form
  const showPassword = !ssoEnabled || showPasswordFallback

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body gap-6">

          {/* Company Logo — shown if set, hidden entirely if not */}
          {logoUrl && (
            <div className="flex justify-center">
              <div className={isDark ? 'bg-white/90 rounded-xl px-4 py-2' : ''}>
                <img
                  src={logoUrl}
                  alt="Company Logo"
                  className="max-h-20 max-w-xs object-contain"
                />
              </div>
            </div>
          )}

          {/* Login Icon — admin-controlled */}
          {loginIconUrl && (
            <div className="flex justify-center">
              <img
                src={loginIconUrl}
                alt="Login Icon"
                className="max-h-16 max-w-[160px] object-contain"
              />
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col items-center gap-1 pb-2">
            <h1 className="text-2xl font-bold text-base-content">Delivery Tracker</h1>
          </div>

          {/* ── SSO Mode ──────────────────────────────────────────────────── */}
          {showSSO && (
            <div className="space-y-4">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={loading}
                onClick={handleSSOSignIn}
              >
                {loading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <KeyRound size={16} />
                }
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
                  className="text-xs text-base-content/40 hover:text-base-content/60 underline underline-offset-2 transition-colors"
                  onClick={() => { setShowPasswordFallback(true); setError(null) }}
                >
                  Sign in with email &amp; password instead
                </button>
              </div>
            </div>
          )}

          {/* ── Password Mode ─────────────────────────────────────────────── */}
          {showPassword && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-medium">Email</span>
                </label>
                <input
                  type="email"
                  className="input input-bordered w-full"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-medium">Password</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="alert alert-error py-2">
                  <AlertCircle size={16} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {/* Back-to-SSO link — only shown when SSO is enabled and user chose fallback */}
              {ssoEnabled && showPasswordFallback && (
                <div className="text-center">
                  <button
                    type="button"
                    className="text-xs text-base-content/40 hover:text-base-content/60 underline underline-offset-2 transition-colors"
                    onClick={() => { setShowPasswordFallback(false); setError(null) }}
                  >
                    ← Back to Okta SSO login
                  </button>
                </div>
              )}
            </form>
          )}

          <div className="text-center text-xs text-base-content/30">
            {ssoEnabled ? 'Okta SSO · Secure · Enterprise-ready' : 'Secure · Enterprise-ready'}
          </div>

        </div>
      </div>
    </div>
  )
}
