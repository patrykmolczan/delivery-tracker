/**
 * onboarding.ts — helper for the first-login guided tour.
 *
 * New file, does not modify data.ts. Mirrors the same auth/fetch pattern
 * used elsewhere (getAuthHeaders + API_BASE) so it stays consistent with
 * the rest of the Lambda-backed API calls.
 */
import { getAuthHeaders } from './supabase'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || ''

/**
 * Marks the current user's onboarding tour as complete so it never shows again.
 * Fails silently (logs only) — never blocks the UI if the request fails.
 */
export async function markOnboardingComplete(): Promise<void> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_completed_onboarding: true }),
    })
    if (!res.ok) {
      console.error('[onboarding] markOnboardingComplete failed', res.status)
    }
  } catch (e) {
    console.error('[onboarding] markOnboardingComplete error', e)
  }
}
