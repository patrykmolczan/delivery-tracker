/**
 * ChangePasswordPage.tsx
 * ----------------------
 * Shown to users whose password_change_required flag is true.
 * Forces them to set a new secure password before accessing the app.
 * 
 * Password requirements:
 *  - Minimum 8 characters
 *  - At least 1 uppercase letter
 *  - At least 1 lowercase letter
 *  - At least 1 number
 *  - At least 1 special character (!@#$%^&*)
 * 
 * On success:
 *  1. Updates password in Supabase Auth
 *  2. Calls clear_password_change_required() RPC to unset flag
 *  3. Logs to audit_log
 *  4. refreshProfile() to update context
 */

import React, { useState } from 'react'
import { Lock, Eye, EyeOff, CheckCircle, XCircle, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogo } from '../hooks/useLogo'
import { useTheme } from '../contexts/ThemeContext'

interface PasswordRequirement {
  label: string
  test: (pw: string) => boolean
}

const REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters',         test: pw => pw.length >= 8 },
  { label: 'One uppercase letter (A–Z)',     test: pw => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)',     test: pw => /[a-z]/.test(pw) },
  { label: 'One number (0–9)',               test: pw => /[0-9]/.test(pw) },
  { label: 'One special character (!@#$%^&*)', test: pw => /[!@#$%^&*]/.test(pw) },
]

function strengthScore(pw: string): number {
  return REQUIREMENTS.filter(r => r.test(pw)).length
}

function strengthLabel(score: number): { label: string; color: string } {
  if (score <= 1) return { label: 'Very Weak',  color: 'bg-error' }
  if (score === 2) return { label: 'Weak',       color: 'bg-warning' }
  if (score === 3) return { label: 'Fair',       color: 'bg-amber-400' }
  if (score === 4) return { label: 'Good',       color: 'bg-info' }
  return               { label: 'Strong',      color: 'bg-success' }
}

export const ChangePasswordPage: React.FC = () => {
  const { user, profile, signOut, refreshProfile, clearPasswordRecovery } = useAuth()
  const { logoUrl } = useLogo()
  const { isDark } = useTheme()

  const [newPw, setNewPw]       = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showNew, setShowNew]   = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const score   = strengthScore(newPw)
  const { label: strengthLbl, color: strengthColor } = strengthLabel(score)
  const allMet  = REQUIREMENTS.every(r => r.test(newPw))
  const matches = newPw === confirmPw && confirmPw.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!allMet) {
      setError('Password does not meet all requirements.')
      return
    }
    if (!matches) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    try {
      // Use direct DB RPC for both recovery and admin-forced flows.
      // supabase.auth.updateUser() hangs indefinitely in both cases because
      // passwords are managed via direct bcrypt updates in auth.users.
      const { error: rpcError } = await supabase.rpc('user_set_forced_password', { new_password: newPw })
      if (rpcError) throw rpcError

      // Log to audit_log
      try {
        await supabase.from('audit_log').insert({
          project_id: null,
          user_id: user?.id ?? null,
          action: 'USER_PASSWORD_CHANGED',
          field_changed: null,
          old_value: null,
          new_value: null,
          metadata: { email: user?.email, reason: 'forced_change_on_login' },
        })
      } catch { /* non-blocking */ }

      // Refresh profile in context (clears passwordChangeRequired)
      await refreshProfile()

      // Clear recovery mode if applicable
      clearPasswordRecovery()

      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center p-4">
        <div className="card bg-base-100 border border-base-300 shadow-xl w-full max-w-md text-center p-8">
          <CheckCircle size={56} className="text-success mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Password Updated</h1>
          <p className="text-base-content/60 mb-6">
            Your password has been set successfully. You can now access the dashboard.
          </p>
          <button
            className="btn btn-primary w-full"
            onClick={() => window.location.href = '/'}
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        {logoUrl && (
          <div className="flex justify-center">
            <div className={`rounded-lg px-3 py-2 transition-colors ${isDark ? 'bg-white/90' : 'bg-transparent'}`}>
              <img src={logoUrl} alt="Logo" style={{ maxHeight: '48px', maxWidth: '160px' }} className="object-contain" />
            </div>
          </div>
        )}

        {/* Card */}
        <div className="card bg-base-100 border border-base-300 shadow-xl">
          <div className="card-body gap-5">

            {/* Header */}
            <div className="flex flex-col items-center text-center gap-2">
              <div className="p-3 bg-warning/10 rounded-full">
                <ShieldCheck size={28} className="text-warning" />
              </div>
              <h1 className="text-xl font-bold">Set Your Password</h1>
              <p className="text-sm text-base-content/60 leading-relaxed">
                Welcome, <strong>{profile?.full_name || user?.email}</strong>.<br />
                For your security, you must set a new password before continuing.
                Your temporary password has been deactivated.
              </p>
            </div>

            <div className="divider my-0" />

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* New password */}
              <div className="form-control gap-1.5">
                <label className="label py-0">
                  <span className="label-text font-medium">New Password</span>
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="input input-bordered w-full pl-8 pr-10"
                    placeholder="Enter new password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                    onClick={() => setShowNew(v => !v)}
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Strength bar */}
                {newPw.length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[1,2,3,4,5].map(i => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all ${
                              score >= i ? strengthColor : 'bg-base-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-base-content/60 w-16 text-right">{strengthLbl}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="form-control gap-1.5">
                <label className="label py-0">
                  <span className="label-text font-medium">Confirm Password</span>
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className={`input input-bordered w-full pl-8 pr-10 ${
                      confirmPw.length > 0 && !matches ? 'input-error' : ''
                    }`}
                    placeholder="Repeat your new password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                    onClick={() => setShowConfirm(v => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirmPw.length > 0 && !matches && (
                  <p className="text-xs text-error mt-0.5">Passwords do not match</p>
                )}
              </div>

              {/* Requirements checklist */}
              <div className="bg-base-200 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-base-content/60 uppercase tracking-wide mb-2">Requirements</p>
                {REQUIREMENTS.map((req, i) => {
                  const met = req.test(newPw)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {met
                        ? <CheckCircle size={13} className="text-success shrink-0" />
                        : <XCircle size={13} className="text-base-content/30 shrink-0" />
                      }
                      <span className={`text-xs ${met ? 'text-base-content' : 'text-base-content/50'}`}>
                        {req.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Error */}
              {error && (
                <div className="alert alert-error text-sm py-2">
                  <XCircle size={14} />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="btn btn-primary w-full gap-2"
                disabled={saving || !allMet || !matches}
              >
                {saving
                  ? <><span className="loading loading-spinner loading-xs" /> Setting Password…</>
                  : <><ShieldCheck size={15} /> Set New Password</>
                }
              </button>
            </form>

            {/* Sign out link */}
            <div className="text-center">
              <button
                className="text-xs text-base-content/40 hover:text-base-content underline-offset-2 hover:underline"
                onClick={signOut}
              >
                Sign out instead
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
