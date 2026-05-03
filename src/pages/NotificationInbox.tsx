import React, { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCheck, Trash2, ExternalLink, Filter } from 'lucide-react'
import type { AppNotification } from '../types'
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../lib/data'

// ── helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString()
}

function groupByDate(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today = new Date(); today.setHours(0,0,0,0)
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7)

  const groups: Record<string, AppNotification[]> = { Today: [], 'This Week': [], Older: [] }
  for (const n of items) {
    const d = new Date(n.created_at); d.setHours(0,0,0,0)
    if (d >= today) groups['Today'].push(n)
    else if (d >= weekAgo) groups['This Week'].push(n)
    else groups['Older'].push(n)
  }
  return Object.entries(groups)
    .filter(([, v]) => v.length > 0)
    .map(([label, items]) => ({ label, items }))
}

interface NotifMeta { icon: string; colorClass: string; badgeClass: string; label: string }
function getNotifMeta(type: string): NotifMeta {
  const map: Record<string, NotifMeta> = {
    feedback_hold:    { icon: '⏸', colorClass: 'text-warning',  badgeClass: 'badge-warning',  label: 'On Hold' },
    feedback_changes: { icon: '📝', colorClass: 'text-info',    badgeClass: 'badge-info',     label: 'Changes Requested' },
    feedback_reject:  { icon: '❌', colorClass: 'text-error',   badgeClass: 'badge-error',    label: 'Rejected' },
    feedback_approve: { icon: '✅', colorClass: 'text-success', badgeClass: 'badge-success',  label: 'Approved' },
    user_response:    { icon: '💬', colorClass: 'text-primary', badgeClass: 'badge-primary',  label: 'User Reply' },
    resubmit:         { icon: '🔄', colorClass: 'text-primary', badgeClass: 'badge-primary',  label: 'Re-submitted' },
    eta_update:       { icon: '🕐', colorClass: 'text-accent',  badgeClass: 'badge-accent',   label: 'ETA Updated' },
    project_created:  { icon: '🆕', colorClass: 'text-success', badgeClass: 'badge-success',  label: 'New Project' },
    status_change:    { icon: '📊', colorClass: 'text-neutral', badgeClass: 'badge-neutral',  label: 'Status Change' },
  }
  return map[type] ?? { icon: '🔔', colorClass: 'text-base-content', badgeClass: 'badge-ghost', label: 'Notification' }
}

type FilterType = 'all' | 'unread' | 'admin_actions' | 'user_actions' | 'eta'
const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'unread',       label: 'Unread' },
  { id: 'admin_actions',label: 'Admin Actions' },
  { id: 'user_actions', label: 'User Actions' },
  { id: 'eta',          label: 'ETA Updates' },
]
const ADMIN_ACTION_TYPES = ['feedback_hold', 'feedback_changes', 'feedback_reject', 'feedback_approve', 'status_change']
const USER_ACTION_TYPES  = ['user_response', 'resubmit', 'project_created']

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  onProjectOpen?: (projectId: string) => void
}

export const NotificationInbox: React.FC<Props> = ({ onProjectOpen }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNotifications(100)
      setNotifications(data)
    } catch { /* best effort */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRead = async (n: AppNotification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    if (n.project_id && onProjectOpen) {
      onProjectOpen(n.project_id)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteNotification(id).catch(() => {})
    setNotifications(prev => prev.filter(x => x.id !== id))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {})
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
  }

  // Filter
  const filtered = notifications.filter(n => {
    if (filter === 'unread')        return !n.is_read
    if (filter === 'admin_actions') return ADMIN_ACTION_TYPES.includes(n.type)
    if (filter === 'user_actions')  return USER_ACTION_TYPES.includes(n.type)
    if (filter === 'eta')           return n.type === 'eta_update'
    return true
  })

  const unreadCount = notifications.filter(n => !n.is_read).length
  const groups = groupByDate(filtered)

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell size={20} className="text-primary" />
            Notifications
            {unreadCount > 0 && (
              <span className="badge badge-error badge-sm">{unreadCount} new</span>
            )}
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">
            {notifications.length} total · {unreadCount} unread
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="btn btn-outline btn-sm gap-1.5"
            onClick={handleMarkAllRead}
          >
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-base-content/40" />
        {FILTER_TABS
          .filter(tab => {
            // Only show tabs that have matching items
            if (tab.id === 'all') return true
            if (tab.id === 'unread') return unreadCount > 0
            if (tab.id === 'admin_actions') return notifications.some(n => ADMIN_ACTION_TYPES.includes(n.type))
            if (tab.id === 'user_actions')  return notifications.some(n => USER_ACTION_TYPES.includes(n.type))
            if (tab.id === 'eta')           return notifications.some(n => n.type === 'eta_update')
            return true
          })
          .map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`badge cursor-pointer transition-all text-xs py-2.5 px-3 ${
                filter === tab.id
                  ? 'badge-primary font-semibold'
                  : 'badge-outline hover:badge-primary/50'
              }`}
            >
              {tab.label}
            </button>
          ))
        }
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-base-content/40">
          <span className="loading loading-spinner loading-md" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-base-content/30">
          <Bell size={36} className="opacity-40" />
          <p className="text-sm font-medium">
            {filter === 'all' ? "You're all caught up!" : 'No notifications in this category'}
          </p>
          {filter !== 'all' && (
            <button className="btn btn-ghost btn-xs" onClick={() => setFilter('all')}>
              View all
            </button>
          )}
        </div>
      )}

      {/* Grouped items */}
      {!loading && groups.map(group => (
        <div key={group.label} className="space-y-1">
          <p className="text-xs font-semibold text-base-content/40 uppercase tracking-wider px-1 mb-2">
            {group.label}
          </p>
          <div className="card bg-base-100 border border-base-300 overflow-hidden">
            {group.items.map((n, idx) => {
              const meta = getNotifMeta(n.type)
              return (
                <button
                  key={n.id}
                  onClick={() => handleRead(n)}
                  className={`w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-base-200 transition-colors
                    ${!n.is_read ? 'bg-primary/5' : ''}
                    ${idx < group.items.length - 1 ? 'border-b border-base-200' : ''}`}
                >
                  {/* Unread dot + icon */}
                  <div className="flex-shrink-0 mt-0.5 relative">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    {!n.is_read && (
                      <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-base-100" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`badge badge-xs ${meta.badgeClass} font-medium`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-base-content/30">{relativeTime(n.created_at)}</span>
                    </div>
                    <p className={`text-sm font-semibold ${!n.is_read ? 'text-base-content' : 'text-base-content/70'}`}>
                      {n.title}
                    </p>
                    {n.project_name && (
                      <p className="text-xs text-primary/70 font-medium mt-0.5">
                        📁 {n.project_name}
                      </p>
                    )}
                    <p className="text-xs text-base-content/50 mt-1 line-clamp-2">{n.body}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-1 ml-2">
                    {n.project_id && (
                      <ExternalLink size={13} className="text-base-content/20" />
                    )}
                    <button
                      onClick={e => handleDelete(e, n.id)}
                      className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 hover:btn-error ml-1"
                      title="Delete notification"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
