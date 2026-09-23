import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getAnnouncementsFor,
  getVisibility,
  getDismissed,
  setDismissed,
  type Announcement,
  type AnnouncementPlacement,
  type AnnouncementVisibility,
} from '../lib/announcements'

export interface ActiveAnnouncement {
  announcement: Announcement
  visibility: AnnouncementVisibility
  dismiss: () => void
}

/**
 * Returns the announcements currently visible for a placement, already
 * filtered by audience, per-user dismissal, and the 21-day (or whatever
 * durationDays says) rolling window.
 *
 * `user.id` here is the Cognito sub (see AuthContext) — that's fine, it's
 * only ever used as a localStorage namespace key, never compared to a
 * profiles.id.
 */
export function useAnnouncements(placement: AnnouncementPlacement): ActiveAnnouncement[] {
  const { user, profile, isAdmin, isSuperAdmin } = useAuth()
  const [dismissedTick, setDismissedTick] = useState(0)

  const dismiss = useCallback((id: string) => {
    if (!user?.id) return
    setDismissed(user.id, id)
    setDismissedTick(t => t + 1) // force recompute
  }, [user])

  return useMemo(() => {
    if (!user?.id || !profile) return []

    // Evaluated once per render pass, not per announcement, so every banner in
    // this placement is judged against the same instant.
    const now = new Date()
    const alreadyDismissed = new Set(getDismissed(user.id))

    return getAnnouncementsFor(placement, { isAdmin, isSuperAdmin })
      .filter(a => !(a.dismissible && alreadyDismissed.has(a.id)))
      .map(a => ({
        announcement: a,
        visibility: getVisibility(a, profile.created_at, now),
        dismiss: () => dismiss(a.id),
      }))
      .filter(x => x.visibility.visible)
  }, [placement, user?.id, profile, isAdmin, isSuperAdmin, dismissedTick, dismiss])
}
