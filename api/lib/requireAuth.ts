/**
 * requireAuth — Supabase JWT validation middleware for Vercel serverless functions.
 *
 * Usage in any handler:
 *   const auth = await requireAuth(req, res)
 *   if (!auth) return   // response already sent (401)
 *   // auth.userId is the verified Supabase user ID
 *
 * Client must send:  Authorization: Bearer <supabase_access_token>
 * Token is obtained: const { data: { session } } = await supabase.auth.getSession()
 */

import { createClient } from '@supabase/supabase-js'

export interface AuthResult {
  userId: string
}

export async function requireAuth(req: any, res: any): Promise<AuthResult | null> {
  const authHeader = (req.headers['authorization'] as string) || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — missing Bearer token' })
    return null
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[requireAuth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
    res.status(500).json({ error: 'Server configuration error' })
    return null
  }

  // createClient per-request (stateless — no session persistence on server)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' })
    return null
  }

  return { userId: user.id }
}
