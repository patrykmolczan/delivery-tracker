import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Returns fetch headers including the current Supabase Bearer token.
 * Use for all calls to /api/* serverless functions.
 *
 * Usage:
 *   const headers = await getAuthHeaders()
 *   const res = await fetch('/api/some-endpoint', { method: 'POST', headers, body: ... })
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  // ensureFreshSession proactively refreshes if token expires in < 2 min
  const session = await ensureFreshSession()
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
  }
}
/**
 * Ensures the current session has a fresh, non-expired access token.
 * Calls refreshSession() over the network if the token expires within 2 minutes.
 * Use this before critical DB writes or API calls after any idle period.
 */
export async function ensureFreshSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  // Proactively refresh if token expires within 2 minutes
  const expiresAt = session.expires_at ?? 0
  if (expiresAt < Math.floor(Date.now() / 1000) + 120) {
    const { data } = await supabase.auth.refreshSession()
    return data.session ?? null
  }
  return session
}

