/**
 * api/lib/rateLimit.ts
 *
 * Lightweight per-user / per-IP rate limiting backed by Supabase.
 * No additional infrastructure (Upstash, Vercel KV, Redis) required.
 *
 * HOW IT WORKS
 * ─────────────
 * Each request increments an atomic counter in the rate_limits table
 * using INSERT ... ON CONFLICT DO UPDATE (safe under concurrent load).
 * The counter is scoped to a (key, time-window) pair:
 *
 *   key format  →  "chat:user:<uuid>"       (authenticated AI endpoints)
 *                  "reset:ip:<sha256hex>"    (unauthenticated password reset)
 *   window      →  Unix epoch floored to windowSec
 *                  e.g. 60s window: floor(now / 60) * 60
 *
 * FAIL-OPEN POLICY
 * ─────────────────
 * If the Supabase call fails for any reason (network, misconfiguration),
 * the function returns { allowed: true } so rate limiting NEVER becomes
 * a hard blocker for real users. Errors are logged server-side.
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// ── Supabase admin client (service role — bypasses RLS) ──────────────────────
// Lazily initialised so the module loads even if env vars are absent
// (Vercel will have them; unit test environments may not).
let _adminClient: ReturnType<typeof createClient> | null = null

function getAdminClient() {
  if (_adminClient) return _adminClient
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _adminClient
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  count: number      // requests made in current window (including this one)
  limit: number      // max allowed
  remaining: number  // requests left in current window
  retryAfter: number // seconds until window resets (for Retry-After header)
}

// ── Core function ────────────────────────────────────────────────────────────

/**
 * Check and increment the rate limit counter for `key`.
 * Returns immediately — adds ~10-20ms latency (negligible vs OpenAI calls).
 *
 * @param key        Unique rate limit key (use buildUserKey / buildIpKey below)
 * @param limit      Max requests allowed per window
 * @param windowSec  Window duration in seconds (e.g. 60, 900)
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowBucket = Math.floor(now / windowSec) * windowSec
  const retryAfter = windowBucket + windowSec - now

  const client = getAdminClient()
  if (!client) {
    // Env vars missing — fail open, log warning
    console.warn('[rateLimit] Supabase admin client unavailable — skipping rate limit check')
    return { allowed: true, count: 0, limit, remaining: limit, retryAfter }
  }

  try {
    const { data, error } = await client.rpc('increment_rate_limit', {
      p_key: key,
      p_window_start: windowBucket,
    })

    if (error) {
      // DB error — fail open
      console.error('[rateLimit] RPC error:', error.message)
      return { allowed: true, count: 0, limit, remaining: limit, retryAfter }
    }

    const count = data as number
    const remaining = Math.max(0, limit - count)
    return { allowed: count <= limit, count, limit, remaining, retryAfter }
  } catch (err) {
    // Unexpected error — fail open
    console.error('[rateLimit] Unexpected error:', err)
    return { allowed: true, count: 0, limit, remaining: limit, retryAfter }
  }
}

/**
 * Apply rate limit to a response object.
 * Returns true if the request should be rejected (caller should return immediately).
 *
 * Usage:
 *   if (await applyRateLimit(res, buildUserKey('chat', userId), 20, 60)) return
 */
export async function applyRateLimit(
  res: any,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const result = await checkRateLimit(key, limit, windowSec)

  // Always set informational headers
  res.setHeader('X-RateLimit-Limit', limit)
  res.setHeader('X-RateLimit-Remaining', result.remaining)
  res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + result.retryAfter)

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter)
    res.status(429).json({
      error: 'Too many requests. Please wait before trying again.',
      retryAfter: result.retryAfter,
    })
    return true // caller should return
  }

  return false // request is allowed, continue
}

// ── Key builders ─────────────────────────────────────────────────────────────

/** Rate limit key for an authenticated user on a named endpoint. */
export function buildUserKey(endpoint: string, userId: string): string {
  return `${endpoint}:user:${userId}`
}

/**
 * Rate limit key for an unauthenticated request, keyed by hashed IP.
 * The IP is hashed (never stored raw) using a SHA-256 with the
 * NOTIFICATION_SECRET as a salt to prevent reversal.
 */
export function buildIpKey(endpoint: string, req: any): string {
  const forwarded = (req.headers['x-forwarded-for'] as string) ?? ''
  const ip = forwarded.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const salt = process.env.NOTIFICATION_SECRET || 'rate-limit-salt'
  const hash = createHash('sha256').update(ip + salt).digest('hex').slice(0, 16)
  return `${endpoint}:ip:${hash}`
}

/**
 * Trigger an async cleanup of expired rate_limit rows.
 * Fire-and-forget — does not block the response.
 * Call this from low-traffic endpoints (e.g. forgot-password).
 */
export function triggerCleanup(): void {
  const client = getAdminClient()
  if (!client) return
  client.rpc('cleanup_rate_limits').then(({ error }) => {
    if (error) console.error('[rateLimit] Cleanup error:', error.message)
  })
}
