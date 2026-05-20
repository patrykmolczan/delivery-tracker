import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * Lock bypass shared by both clients.
 * Prevents navigator.locks from ever being acquired — eliminates the
 * Web Locks deadlock that manifests after ~3–4 minutes idle when the
 * realtime WebSocket reconnects and tries to call getSession() while
 * the main client is also mid-operation.
 */
const lockBypass = <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()

/**
 * Main Supabase client — used for all DB queries, auth, and API calls.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: lockBypass,
  },
})

/**
 * Realtime-only Supabase client — used exclusively by NotificationBell.
 *
 * autoRefreshToken: false  → never schedules proactive token refreshes.
 * detectSessionInUrl: false → no URL parsing on creation.
 * lock: lockBypass         → also bypasses navigator.locks so reconnect
 *                            attempts after idle cannot deadlock or
 *                            corrupt shared localStorage session data.
 */
export const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    lock: lockBypass,
  },
})

/**
 * Module-level token cache — kept fresh by onAuthStateChange.
 * getAuthHeaders() reads from this synchronously — zero async, zero locks.
 */
let _cachedToken: string | null = null

supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null
})

supabase.auth.getSession().then(({ data }) => {
  if (data.session?.access_token) {
    _cachedToken = data.session.access_token
  }
})

/**
 * Returns fetch headers for /api/* calls.
 * Prefers Cognito ID token (for Lambda API) over Supabase token.
 * Falls back to cached Supabase token for backward compat.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { getSession: cognitoGetSession } = await import('./cognitoAuth')
    const cognitoSession = await cognitoGetSession()
    if (cognitoSession?.idToken) {
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cognitoSession.idToken}`,
      }
    }
  } catch {
    // cognitoAuth not available or no session — fall through
  }
  return {
    'Content-Type': 'application/json',
    ...(_cachedToken ? { Authorization: `Bearer ${_cachedToken}` } : {}),
  }
}

/**
 * Legacy helper — session freshness maintained via onAuthStateChange.
 * Kept to avoid breaking callers.
 */
export async function ensureFreshSession() {
  return _cachedToken ? { access_token: _cachedToken } : null
}
