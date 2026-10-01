import React, { useEffect, useState } from 'react'
import { Zap, Shield, AlertCircle, CheckCircle2 } from 'lucide-react'
import { fetchAppSettings, updateAppSetting, PREDICTION_WINDOW_DAYS } from '../lib/data'
import { AI_ESTIMATE_SETTING_KEY, parseAiEstimateEnabled } from '../hooks/useAiEstimateEnabled'

/**
 * Admin Panel card — lets a super admin switch the AI Delivery Estimate on or off
 * for everyone. Render this for super admins only; the backend enforces the same
 * rule independently (routes/settings.js).
 */
export const AiEstimateSetting: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAppSettings()
      .then(settings => { if (!cancelled) setEnabled(parseAiEstimateEnabled(settings)) })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [])

  const handleToggle = async () => {
    if (enabled === null || saving) return
    const next = !enabled
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateAppSetting(AI_ESTIMATE_SETTING_KEY, String(next))
      setEnabled(next)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to update setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between mb-1">
          <h3 className="card-title text-base flex items-center gap-2">
            <Zap size={18} className="text-primary" /> AI Delivery Estimate
          </h3>
          <span className="badge badge-warning badge-sm flex items-center gap-1">
            <Shield size={10} /> Super Admin Only
          </span>
        </div>
        <p className="text-xs text-base-content/50 mb-4">
          When active, the estimate is shown on the New Project form and in each project's Details tab,
          calculated from projects completed in the last {PREDICTION_WINDOW_DAYS} days. When inactive, it is
          hidden for all users. Existing estimates and admin overrides are kept and reappear if you re-activate it.
        </p>

        {error && (
          <div className="alert alert-error py-2 mb-3">
            <AlertCircle size={14} />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {saved && !error && (
          <div className="alert alert-success py-2 mb-3">
            <CheckCircle2 size={14} />
            <span className="text-sm">
              AI Delivery Estimate is now {enabled ? 'active' : 'inactive'} for all users.
            </span>
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-xl">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              Show AI Delivery Estimate
              {enabled !== null && (
                <span className={`badge badge-sm ${enabled ? 'badge-success' : 'badge-ghost'}`}>
                  {enabled ? 'Active' : 'Inactive'}
                </span>
              )}
            </p>
            <p className="text-xs text-base-content/50 mt-0.5">
              Applies to every user immediately on their next page load.
            </p>
          </div>
          {saving && <span className="loading loading-spinner loading-xs mr-2" />}
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={enabled === true}
            disabled={enabled === null || saving}
            onChange={handleToggle}
            aria-label="Show AI Delivery Estimate"
          />
        </div>
      </div>
    </div>
  )
}
