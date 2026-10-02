import { useEffect, useState } from 'react'
import { fetchAppSettings } from '../lib/data'

/** app_settings key behind the super-admin "AI Delivery Estimate" on/off switch. */
export const AI_ESTIMATE_SETTING_KEY = 'ai_estimate_enabled'

/** The feature is on only when the setting is explicitly "true"; a missing or unreadable value means off. */
export const parseAiEstimateEnabled = (settings: Record<string, string>): boolean =>
  settings[AI_ESTIMATE_SETTING_KEY] === 'true'

/**
 * Whether the AI Delivery Estimate feature is switched on.
 * Returns null while the setting is loading — callers render nothing for null,
 * so the estimate never flashes on screen before the setting is known.
 */
export function useAiEstimateEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAppSettings()
      .then(settings => { if (!cancelled) setEnabled(parseAiEstimateEnabled(settings)) })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [])

  return enabled
}
