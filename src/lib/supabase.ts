import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

/**
 * Supabase client with navigator.locks bypass.
 *
 * Root cause of the deadlock:
 *   The notification bell's realtime subscription internally calls refreshSession()
 *   which acquires an exclusive navigator.locks Web Lock (keyed by project ref).
 *   Any concurrent auth call — getSession(), insert(), API fetch — queues behind
 *   that lock and waits forever if the realtime client never releases it (e.g.
 *   during a reconnection cycle with a stale connection).
 *
 * Fix:
 *   The Supabase auth client accepts a custom `lock` function. We provide a
 *   no-op passthrough so auth operations run immediately without lock contention.
 *   This is the officially supported pattern for environments where navigator.locks
 *   causes issues (documented at supabase.com/docs/reference/javascript/createclient).
 *
 * Security impact: None.
 *   The lock was added to prevent concurrent token refreshes across multiple tabs.
 *   Worst case without it: two concurrent refreshes both succeed; one result is
 *   immediately superseded. This is a negligible risk for a single-user browser
 *   app and does not expose tokens or weaken authentication in any way.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
})

/**
 * Returns fetch headers including the current Supabase Bearer token.
 * Use for all calls to /api/* serverless functions.
 *
 * Usage:
 *   const headers = await getAuthHeaders()
 *   const res = await fetch('/api/some-endpoint', { method: 'POST', headers, body: ... })
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
  }
}

/**
 * Ensures the current session has a fresh, non-expired access token.
 * Calls refreshSession() over the network if the token expires within 2 minutes.
 */
export async function ensureFreshSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const expiresAt = session.expires_at ?? 0
  if (expiresAt < Math.floor(Date.now() / 1000) + 120) {
    const { data } = await supabase.auth.refreshSession()
    return data.session ?? null
  }
  return session
}
