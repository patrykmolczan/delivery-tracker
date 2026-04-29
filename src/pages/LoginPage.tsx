import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Truck, Loader2, AlertCircle } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Truck className="text-primary" size={32} />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-base-content">Delivery Tracker</h1>
              <p className="text-sm text-base-content/50 mt-1">Procurement & HR Project Management</p>
            </div>
          </div>

          {/* Form */}
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
          </form>

          <div className="text-center text-xs text-base-content/30">
            OKTA SSO coming soon · Secure · Enterprise-ready
          </div>
        </div>
      </div>
    </div>
  )
}
