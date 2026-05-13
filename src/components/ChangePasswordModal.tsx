import React, { useState } from 'react'
import { X, Eye, EyeOff, Lock, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
}

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-error' }
  if (score <= 2) return { score, label: 'Fair',   color: 'bg-warning' }
  if (score <= 3) return { score, label: 'Good',   color: 'bg-info' }
  return             { score, label: 'Strong', color: 'bg-success' }
}

export default function ChangePasswordModal({ onClose }: Props) {
  const { user } = useAuth()
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [showCon,  setShowCon]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const strength = getStrength(next)
  const mismatch = confirm.length > 0 && next !== confirm
  const meetsMin = next.length >= 8 && /[A-Z]/.test(next) && /[0-9]/.test(next)
  const canSubmit = current.length > 0 && meetsMin && next === confirm && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)

    // Step 1: verify current password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: current,
    })
    if (signInErr) {
      setError('Current password is incorrect.')
      setLoading(false)
      return
    }

    // Step 2: update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: next })
    if (updateErr) {
      setError(updateErr.message || 'Failed to update password.')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            <h2 className="text-lg font-semibold">Change Password</h2>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 size={48} className="text-success" />
            <p className="font-semibold text-lg">Password updated!</p>
            <p className="text-sm text-base-content/60">Your new password is active. Use it on your next sign-in.</p>
            <button className="btn btn-primary btn-sm mt-2" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Current password */}
            <div className="form-control gap-1">
              <label className="label py-0"><span className="label-text text-xs font-medium">Current password</span></label>
              <div className="relative">
                <input
                  type={showCur ? 'text' : 'password'}
                  className="input input-bordered input-sm w-full pr-9"
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  onClick={() => setShowCur(v => !v)}>
                  {showCur ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="form-control gap-1">
              <label className="label py-0"><span className="label-text text-xs font-medium">New password</span></label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  className="input input-bordered input-sm w-full pr-9"
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  onClick={() => setShowNew(v => !v)}>
                  {showNew ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {/* Strength bar */}
              {next.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 flex gap-0.5 h-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`flex-1 rounded-full transition-all ${i <= strength.score ? strength.color : 'bg-base-300'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-base-content/50 w-12">{strength.label}</span>
                </div>
              )}
              <ul className="text-xs text-base-content/50 mt-1 space-y-0.5">
                <li className={next.length >= 8 ? 'text-success' : ''}>• At least 8 characters</li>
                <li className={/[A-Z]/.test(next) ? 'text-success' : ''}>• At least one uppercase letter</li>
                <li className={/[0-9]/.test(next) ? 'text-success' : ''}>• At least one number</li>
              </ul>
            </div>

            {/* Confirm new password */}
            <div className="form-control gap-1">
              <label className="label py-0"><span className="label-text text-xs font-medium">Confirm new password</span></label>
              <div className="relative">
                <input
                  type={showCon ? 'text' : 'password'}
                  className={`input input-bordered input-sm w-full pr-9 ${mismatch ? 'input-error' : ''}`}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  onClick={() => setShowCon(v => !v)}>
                  {showCon ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              {mismatch && <p className="text-xs text-error mt-0.5">Passwords do not match.</p>}
            </div>

            {error && (
              <div className="alert alert-error py-2 text-sm">{error}</div>
            )}

            <div className="flex gap-2 mt-1">
              <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn-primary btn-sm flex-1 ${loading ? 'loading' : ''}`} disabled={!canSubmit}>
                {loading ? '' : 'Update password'}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>
  )
}
