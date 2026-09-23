/**
 * announcements.ts — time-boxed in-app announcement banners.
 *
 * Every user gets the full `durationDays` window, anchored at the first moment
 * THEY could have seen it:   anchor = max(publishedAt, user.created_at)
 *
 * Joined before publication → starts at publication.
 * Joined after  publication → starts at their join date, so they still get the
 *                             full window rather than someone else's remainder.
 *
 * `hardExpiresAt` is the global backstop. Without it, max() would mean every
 * future signup sees the banner forever.
 *
 * Adding a banner: append to ANNOUNCEMENTS + add copy to ANNOUNCEMENT_BODY in
 * src/components/announcementCopy.tsx. Never reuse or repurpose an `id` — it
 * is the dismissal key.
 */

export type AnnouncementPlacement =
  | 'new-project-client'
  | 'dashboard-top'
  | 'global-top'

export interface Announcement {
  /** Stable, permanent. Used as the dismissal key. Never reuse. */
  id: string
  placement: AnnouncementPlacement
  /** ISO date, UTC. When this went live. */
  publishedAt: string
  /** Per-user visible window length. */
  durationDays: number
  /**
   * Global cut-off. After this instant nobody sees it, regardless of join date.
   * Required — omitting it makes the banner immortal for future signups.
   */
  hardExpiresAt: string
  variant?: 'info' | 'success' | 'warning'
  title?: string
  /** Per-user dismiss button. Default false: a fixed-duration notice should persist. */
  dismissible?: boolean
  /** Optional audience gate, e.g. admins only. */
  audience?: (ctx: AudienceContext) => boolean
}

export interface AudienceContext {
  isAdmin: boolean
  isSuperAdmin: boolean
}

export interface AnnouncementVisibility {
  visible: boolean
  /** Whole days left, floor, min 0. 0 means "expires today". */
  daysRemaining: number
  anchor: Date | null
  expiresAt: Date | null
}

const MS_PER_DAY = 86_400_000

/**
 * Parse a date that may arrive as 'YYYY-MM-DD' or a full Postgres ISO timestamp
 * ('2026-09-15T00:00:00.000Z'). data.ts:formatDate has the same defensive note —
 * Aurora returns full timestamps where the column is logically a date, and
 * /api/me does exactly this for profiles.created_at.
 */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = value.includes('T') ? value : `${value}T00:00:00.000Z`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Core rule. Pure — `now` and `userCreatedAt` are injected, never read from
 * globals, so this is directly unit-testable.
 */
export function getVisibility(
  announcement: Announcement,
  userCreatedAt: string | null | undefined,
  now: Date,
): AnnouncementVisibility {
  const miss: AnnouncementVisibility = { visible: false, daysRemaining: 0, anchor: null, expiresAt: null }

  const publishedAt = parseDate(announcement.publishedAt)
  const hardExpiresAt = parseDate(announcement.hardExpiresAt)
  const joinedAt = parseDate(userCreatedAt)

  // Malformed config → fail closed. Never show a banner we can't time-bound.
  if (!publishedAt || !hardExpiresAt) return miss

  // No profile yet (still loading, or /api/me failed). Fail closed rather than
  // flashing the banner and yanking it once the profile resolves.
  if (!joinedAt) return miss

  const anchor = new Date(Math.max(publishedAt.getTime(), joinedAt.getTime()))
  const softExpiry = anchor.getTime() + announcement.durationDays * MS_PER_DAY
  const expiresAt = new Date(Math.min(softExpiry, hardExpiresAt.getTime()))

  const nowMs = now.getTime()
  const visible = nowMs >= anchor.getTime() && nowMs < expiresAt.getTime()
  const daysRemaining = visible
    ? Math.max(0, Math.floor((expiresAt.getTime() - nowMs) / MS_PER_DAY))
    : 0

  return { visible, daysRemaining, anchor, expiresAt }
}

/** "3 more days" / "1 more day" / "Last day". Keep it short — it renders inline. */
export function formatDaysRemaining(days: number): string {
  if (days <= 0) return 'Last day'
  if (days === 1) return '1 more day'
  return `${days} more days`
}

// ── Dismissal store ──────────────────────────────────────────────────────────
// localStorage, namespaced per user so a shared machine doesn't leak state.
// Deliberately NOT server-persisted: a dismissal is a convenience, and every
// write is one more endpoint to build. Swap the two functions below for API
// calls if that changes; nothing else needs to know.

const DISMISS_KEY = 'dt_announcement_dismissed'

function dismissKey(userId: string): string {
  return `${DISMISS_KEY}:${userId}`
}

export function getDismissed(userId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] // Safari private mode / corrupt value
  }
}

export function setDismissed(userId: string, announcementId: string): void {
  try {
    const next = [...new Set([...getDismissed(userId), announcementId])]
    localStorage.setItem(dismissKey(userId), JSON.stringify(next))
  } catch {
    /* non-fatal — worst case the banner reappears */
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────
// SET publishedAt TO THE ACTUAL DEPLOY DATE BEFORE MERGING.

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'client-project-type-refresh-2026-09',
    placement: 'new-project-client',
    publishedAt: '2026-09-22',
    durationDays: 21,
    hardExpiresAt: '2026-12-31',
    variant: 'info',
    title: 'Updated',
  },
]

export function getAnnouncementsFor(
  placement: AnnouncementPlacement,
  ctx: AudienceContext,
): Announcement[] {
  return ANNOUNCEMENTS.filter(
    a => a.placement === placement && (!a.audience || a.audience(ctx)),
  )
}
