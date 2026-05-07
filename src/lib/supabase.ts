import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * Main Supabase client — used for all DB queries, auth, and API calls.
 *
 * navigator.locks bypass is kept as a safety net, but the real fix is
 * supabaseRealtime (below): NotificationBell uses that client for its
 * channel subscription so it never holds the Web Lock that would block
 * the main client's getSession() inside .from().insert().
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
})

/**
 * Realtime-only Supabase client — used exclusively by NotificationBell.
 *
 * autoRefreshToken: false  → never calls navigator.locks.request()
 *                            so the realtime subscription cannot deadlock
 *                            the main client's auth operations.
 * detectSessionInUrl: false → no URL parsing on creation.
 *
 * The subscription will use the current stored session. If the session
 * expires after a long idle, the subscription may eventually need to
 * reconnect — that is acceptable behaviour for a notification bell.
 */
export const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
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
 * Returns fetch headers including the current Supabase Bearer token.
 * Use for all calls to /api/* serverless functions.
 * Synchronous read from cache — no locks, no async, cannot hang.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
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
