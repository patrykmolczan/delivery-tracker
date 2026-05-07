import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * Supabase client with navigator.locks bypass.
 *
 * The notification bell's realtime subscription holds an exclusive
 * navigator.locks Web Lock keyed by project ref. Without the bypass,
 * any concurrent supabase.auth.* call queues behind that lock and
 * waits indefinitely after idle time.
 *
 * The `lock` option (officially supported, documented by Supabase) replaces
 * the locking strategy with a no-op passthrough so auth operations run
 * immediately without contention.
 *
 * Security impact: None.
 * The lock prevents concurrent token refreshes across multiple tabs.
 * Worst case without it: two concurrent refreshes both succeed; one is
 * immediately superseded. Negligible risk for a single-user browser session.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
  },
})

/**
 * Module-level token cache — kept fresh by onAuthStateChange.
 *
 * Why: Even with the lock bypass, calling supabase.auth.getSession() from
 * within a form submit handler can deadlock if the Supabase client's internal
 * Promise queue is stalled after a period of idle time (e.g. realtime
 * reconnection in progress). By caching the token at module load and updating
 * it via the auth event system, getAuthHeaders() returns synchronously with
 * zero async overhead and zero lock contention.
 */
let _cachedToken: string | null = null

// Keep cache current via Supabase's event system.
// Fires on: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null
})

// Seed the cache from the existing session at module load.
// This runs once when the module is first imported — before any realtime
// subscriptions are created by components — so there is no lock contention.
supabase.auth.getSession().then(({ data }) => {
  if (data.session?.access_token) {
    _cachedToken = data.session.access_token
  }
})

/**
 * Returns fetch headers including the current Supabase Bearer token.
 * Use for all calls to /api/* serverless functions.
 *
 * Reads from the module-level cache — resolves immediately with no
 * async operations, no network calls, and no lock acquisitions.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    ...(_cachedToken ? { Authorization: `Bearer ${_cachedToken}` } : {}),
  }
}

/**
 * Legacy helper — no longer needed.
 * Session freshness is maintained automatically via onAuthStateChange.
 * Kept to avoid breaking callers; safe to remove over time.
 */
export async function ensureFreshSession() {
  return _cachedToken ? { access_token: _cachedToken } : null
}
