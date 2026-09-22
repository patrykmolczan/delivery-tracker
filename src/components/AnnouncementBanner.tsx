import React from 'react'
import { X } from 'lucide-react'
import { formatDaysRemaining } from '../lib/announcements'
import { ANNOUNCEMENT_BODY } from './announcementCopy'
import type { ActiveAnnouncement } from '../hooks/useAnnouncements'

const VARIANT_CLASSES = {
  info:    'bg-primary/5 border-primary/30',
  success: 'bg-success/10 border-success/30',
  warning: 'bg-warning/10 border-warning/40',
} as const

interface Props {
  item: ActiveAnnouncement
}

export const AnnouncementBanner: React.FC<Props> = ({ item }) => {
  const { announcement, visibility, dismiss } = item
  const variant = announcement.variant ?? 'info'

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-base-content ${VARIANT_CLASSES[variant]}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 text-xs leading-relaxed">
          {announcement.title && (
            <span className="font-semibold text-primary">{announcement.title}: </span>
          )}
          {ANNOUNCEMENT_BODY[announcement.id] ?? null}
        </div>
        {announcement.dismissible && (
          <button
            type="button"
            onClick={dismiss}
            className="btn btn-ghost btn-xs btn-square shrink-0 text-base-content/40 hover:text-base-content"
            aria-label="Dismiss announcement"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-base-content/40">
        Visible for {formatDaysRemaining(visibility.daysRemaining)}
      </div>
    </div>
  )
}

/** Renders every active announcement for a placement. Renders nothing if empty. */
export const AnnouncementSlot: React.FC<{ items: ActiveAnnouncement[] }> = ({ items }) => {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map(item => (
        <AnnouncementBanner key={item.announcement.id} item={item} />
      ))}
    </div>
  )
}
