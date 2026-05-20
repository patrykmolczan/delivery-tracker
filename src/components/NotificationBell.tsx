import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckCheck, ExternalLink, X, Check } from 'lucide-react'
import { pollTable } from '../lib/pollingClient'
import type { AppNotification } from '../types'
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/data'

// ── helpers ──────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

interface NotifMeta { icon: string; colorClass: string; label: string }
function getNotifMeta(type: string): NotifMeta {
  const map: Record<string, NotifMeta> = {
    feedback_hold:    { icon: '⏸', colorClass: 'text-warning',  label: 'On Hold' },
    feedback_changes: { icon: '📝', colorClass: 'text-info',    label: 'Changes Requested' },
    feedback_reject:  { icon: '❌', colorClass: 'text-error',   label: 'Rejected' },
    feedback_approve: { icon: '✅', colorClass: 'text-success', label: 'Approved' },
    user_response:    { icon: '💬', colorClass: 'text-primary', label: 'User Reply' },
    resubmit:         { icon: '🔄', colorClass: 'text-primary', label: 'Re-submitted' },
    eta_update:       { icon: '🕐', colorClass: 'text-accent',  label: 'ETA Updated' },
    project_created:  { icon: '🆕', colorClass: 'text-success', label: 'New Project' },
    status_change:    { icon: '📊', colorClass: 'text-base-content', label: 'Status Change' },
    assignment_changed: { icon: '👤', colorClass: 'text-secondary', label: 'Assignment' },
    chat_message:       { icon: '💬', colorClass: 'text-primary',   label: 'Chat Message' },
  }
  return map[type] ?? { icon: '🔔', colorClass: 'text-base-content', label: 'Notification' }
}

// ── tab routing by notification type ─────────────────────────────────────────
function getNotifTab(type: string): string | undefined {
  const reviewTypes = ['resubmit', 'checklist_resolved', 'feedback_hold', 'feedback_changes', 'feedback_reject', 'feedback_approve', 'user_response']
  if (reviewTypes.includes(type)) return 'review'
  if (type === 'eta_update') return 'details'
  if (type === 'status_change') return 'details'
  if (type === 'assignment_changed') return 'details'
  if (type === 'chat_message') return 'chat'
  return undefined
}

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  onViewAll: () => void
  onProjectOpen?: (projectId: string, tab?: string) => void
}

export const NotificationBell: React.FC<Props> = ({ onViewAll, onProjectOpen }) => {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [notifs, count] = await Promise.all([
        fetchNotifications(8, true),
        fetchUnreadNotificationCount(),
      ])
      setNotifications(notifs)
      setUnreadCount(count)
    } catch { /* best effort */ }
    finally { setLoading(false) }
  }, [])

  // Initial load
  useEffect(() => { load() }, [load])

  // Poll for new notifications every 15s (replaces Supabase Realtime channel)
  useEffect(() => {
    const poll = pollTable('notifications', load, 15_000)
    return () => { poll.unsubscribe() }
  }, [load])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleItemClick = async (n: AppNotification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    if (n.project_id && onProjectOpen) {
      onProjectOpen(n.project_id, getNotifTab(n.type))
      setOpen(false)
    }
  }

  const handleDismiss = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation()
    await markNotificationRead(notifId).catch(() => {})
    setNotifications(prev => prev.filter(x => x.id !== notifId))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {})
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
    setUnreadCount(0)
  }

  const handleToggle = () => {
    if (!open) load()
    setOpen(prev => !prev)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        className="btn btn-ghost btn-sm btn-square relative"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-error text-error-content text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-base-100 border border-base-300 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="badge badge-error badge-sm text-[10px]">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                  className="btn btn-ghost btn-xs gap-1 text-xs"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={12} /> All read
                </button>
              <button className="btn btn-ghost btn-xs btn-square" onClick={() => setOpen(false)}>
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="max-h-[340px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-base-content/40 text-sm">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-base-content/40">
                <Check size={24} className="opacity-40" />
                <p className="text-sm font-medium">No new notifications</p>
                <button
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => { setOpen(false); onViewAll() }}
                >
                  View history
                </button>
              </div>
            ) : (
              notifications.map(n => {
                const meta = getNotifMeta(n.type)
                return (
                  <div
                    key={n.id}
                    className="flex items-start border-b border-base-200 last:border-0 bg-primary/5 hover:bg-base-200 transition-colors"
                  >
                    {/* Clickable area — navigate */}
                    <button
                      onClick={() => handleItemClick(n)}
                      className="flex-1 text-left px-4 py-3 flex items-start gap-3 min-w-0"
                    >
                      <div className="flex-shrink-0 mt-0.5 relative">
                        <span className="text-lg leading-none">{meta.icon}</span>
                        <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-primary rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate text-base-content">{n.title}</p>
                        {n.project_name && (
                          <p className="text-[11px] text-primary/80 font-medium truncate">{n.project_name}</p>
                        )}
                        <p className="text-[11px] text-base-content/50 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-base-content/30 mt-1">{relativeTime(n.created_at)}</p>
                      </div>
                      {n.project_id && (
                        <ExternalLink size={11} className="flex-shrink-0 mt-1 text-base-content/20" />
                      )}
                    </button>
                    {/* Dismiss button — mark read without navigating */}
                    <button
                      onClick={(e) => handleDismiss(e, n.id)}
                      className="flex-shrink-0 p-2 mr-1 mt-2 btn btn-ghost btn-xs btn-square text-base-content/30 hover:text-base-content"
                      title="Mark as read"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-base-300 bg-base-200/50">
            <button
              className="btn btn-ghost btn-xs w-full text-primary text-xs"
              onClick={() => { setOpen(false); onViewAll() }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

