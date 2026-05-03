import React, { useState } from 'react'
import {
  Clock, MessageSquare, XCircle, CheckCircle2, RefreshCw,
  AlertTriangle, Loader2, Send, ChevronDown, ChevronUp,
  Check, CornerDownRight,
} from 'lucide-react'
import type { ProjectFeedback, ProjectFeedbackItem } from '../types'

interface Props {
  entries: ProjectFeedback[]
  items: ProjectFeedbackItem[]
  isAdmin: boolean
  currentUserId: string
  currentUserName: string
  projectOwnerId: string | null
  onItemResolve: (item: ProjectFeedbackItem, note: string) => Promise<void>
  onItemUnresolve: (item: ProjectFeedbackItem) => Promise<void>
  onAddResponse: (message: string) => Promise<void>
  onResubmit: () => Promise<void>
  loading?: boolean
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const ACTION_META: Record<string, {
  label: string
  icon: React.ElementType
  borderColor: string
  headerBg: string
  avatarBg: string
  badgeCls: string
  dot: string
}> = {
  hold: {
    label: 'Put On Hold',
    icon: Clock,
    borderColor: 'border-l-warning',
    headerBg: 'bg-warning/8',
    avatarBg: 'bg-warning/15 text-warning border-warning/20',
    badgeCls: 'bg-warning/15 text-warning border-warning/30',
    dot: 'bg-warning',
  },
  request_changes: {
    label: 'Changes Requested',
    icon: MessageSquare,
    borderColor: 'border-l-info',
    headerBg: 'bg-info/8',
    avatarBg: 'bg-info/15 text-info border-info/20',
    badgeCls: 'bg-info/15 text-info border-info/30',
    dot: 'bg-info',
  },
  reject: {
    label: 'Rejected',
    icon: XCircle,
    borderColor: 'border-l-error',
    headerBg: 'bg-error/8',
    avatarBg: 'bg-error/15 text-error border-error/20',
    badgeCls: 'bg-error/15 text-error border-error/30',
    dot: 'bg-error',
  },
  approve: {
    label: 'Approved',
    icon: CheckCircle2,
    borderColor: 'border-l-success',
    headerBg: 'bg-success/8',
    avatarBg: 'bg-success/15 text-success border-success/20',
    badgeCls: 'bg-success/15 text-success border-success/30',
    dot: 'bg-success',
  },
  user_response: {
    label: 'Response',
    icon: CornerDownRight,
    borderColor: 'border-l-primary',
    headerBg: 'bg-primary/5',
    avatarBg: 'bg-primary/15 text-primary border-primary/20',
    badgeCls: 'bg-primary/10 text-primary border-primary/20',
    dot: 'bg-primary',
  },
  resubmit: {
    label: 'Submitted for Re-review',
    icon: RefreshCw,
    borderColor: 'border-l-success',
    headerBg: 'bg-success/8',
    avatarBg: 'bg-success/15 text-success border-success/20',
    badgeCls: 'bg-success/15 text-success border-success/30',
    dot: 'bg-success',
  },
  comment: {
    label: 'Comment',
    icon: MessageSquare,
    borderColor: 'border-l-base-300',
    headerBg: 'bg-base-200',
    avatarBg: 'bg-base-300 text-base-content/50 border-base-300',
    badgeCls: 'bg-base-200 text-base-content/50 border-base-300',
    dot: 'bg-base-content/30',
  },
}

const PRIORITY_CLS: Record<string, string> = {
  high: 'text-error bg-error/10 border-error/20',
  medium: 'text-warning bg-warning/10 border-warning/20',
  low: 'text-base-content/40 bg-base-200 border-base-300',
}

const CATEGORY_LABEL: Record<string, string> = {
  template: 'Template',
  information: 'Missing Info',
  documentation: 'Documentation',
  data_quality: 'Data Quality',
  other: 'Other',
  general: 'General',
}

interface ResolveState {
  itemId: string
  note: string
}

export const FeedbackThread: React.FC<Props> = ({
  entries,
  items,
  isAdmin,
  currentUserId,
  currentUserName: _currentUserName,
  projectOwnerId,
  onItemResolve,
  onItemUnresolve,
  onAddResponse,
  onResubmit,
  loading,
}) => {
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState<ResolveState | null>(null)
  const [unresolving, setUnresolving] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [sendingResponse, setSendingResponse] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  // Determine if there's an active hold/changes that needs user action
  const lastAdminAction = [...entries]
    .reverse()
    .find(e => ['hold', 'request_changes', 'reject'].includes(e.action_type))
  const lastUserAction = [...entries]
    .reverse()
    .find(e => ['user_response', 'resubmit'].includes(e.action_type))

  const isAwaitingUserAction = lastAdminAction && (
    !lastUserAction ||
    new Date(lastAdminAction.created_at) > new Date(lastUserAction.created_at)
  )

  const isRequester = !isAdmin && (projectOwnerId === currentUserId || true)

  const unresolvedItems = items.filter(i => !i.is_resolved)

  const itemsByFeedback = (feedbackId: string) =>
    items.filter(i => i.feedback_id === feedbackId)

  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleItemResolve = async (item: ProjectFeedbackItem) => {
    if (resolveNote?.itemId === item.id) {
      // confirm resolve with note
      setResolvingId(item.id)
      try {
        await onItemResolve(item, resolveNote.note)
        setResolveNote(null)
      } finally {
        setResolvingId(null)
      }
    } else {
      // open resolve note input
      setResolveNote({ itemId: item.id, note: '' })
    }
  }

  const handleItemUnresolve = async (item: ProjectFeedbackItem) => {
    setUnresolving(item.id)
    try {
      await onItemUnresolve(item)
    } finally {
      setUnresolving(null)
    }
  }

  const handleSendResponse = async () => {
    if (!responseText.trim()) return
    setSendingResponse(true)
    try {
      await onAddResponse(responseText.trim())
      setResponseText('')
      setComposing(false)
    } finally {
      setSendingResponse(false)
    }
  }

  const handleResubmit = async () => {
    setResubmitting(true)
    try {
      await onResubmit()
    } finally {
      setResubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={24} className="animate-spin text-primary/40" />
        <p className="text-sm text-base-content/30">Loading feedback thread…</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
        <div className="w-12 h-12 rounded-2xl bg-base-200 border border-base-300 flex items-center justify-center">
          <MessageSquare size={20} className="text-base-content/20" />
        </div>
        <div>
          <p className="text-sm font-medium text-base-content/40">No feedback yet</p>
          <p className="text-xs text-base-content/25 mt-1">
            {isAdmin
              ? 'Use the action buttons above to put this project on hold, request changes, or reject it.'
              : 'Your project is under review. No feedback has been submitted yet.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* ── Summary banner when action required ─────────────────────────── */}
      {isAwaitingUserAction && isRequester && lastAdminAction && (
        <div className="mx-4 mt-4 flex items-start gap-3 p-3.5 bg-warning/10 rounded-xl border border-warning/30">
          <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-base-content">Action Required</p>
            <p className="text-xs text-base-content/60 mt-0.5">
              {unresolvedItems.length > 0
                ? `${unresolvedItems.length} item${unresolvedItems.length !== 1 ? 's' : ''} need your attention before this project can proceed`
                : 'Please review the admin feedback and submit your response'}
            </p>
          </div>
        </div>
      )}

      {/* ── Timeline entries ─────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">
        {entries.map((entry) => {
          const meta = ACTION_META[entry.action_type] || ACTION_META.comment
          const EntryIcon = meta.icon
          const entryItems = itemsByFeedback(entry.id)
          const isExpanded = expandedEntries.has(entry.id) || entryItems.length <= 3
          const hasItems = entryItems.length > 0
          const isAdminEntry = entry.author_role === 'admin'

          return (
            <div
              key={entry.id}
              className={`relative rounded-xl border border-base-300 border-l-4 ${meta.borderColor} overflow-hidden bg-base-100 shadow-sm`}
            >
              {/* Entry header */}
              <div className={`flex items-center gap-3 px-4 py-3 ${meta.headerBg} border-b border-base-300/60`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold ${meta.avatarBg}`}>
                  {initials(entry.author_name)}
                </div>

                {/* Name + badge */}
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-base-content truncate">
                    {entry.author_name || 'Unknown'}
                  </span>
                  {isAdminEntry && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                      Admin
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${meta.badgeCls}`}>
                    <EntryIcon size={10} />
                    {meta.label}
                  </span>
                  {entry.status_change_to_name && (
                    <span className="text-[10px] text-base-content/40">
                      → <span className="font-medium">{entry.status_change_to_name}</span>
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                <span
                  className="text-[10px] text-base-content/35 shrink-0"
                  title={new Date(entry.created_at).toLocaleString()}
                >
                  {timeAgo(entry.created_at)}
                </span>
              </div>

              {/* Message body */}
              {entry.message && (
                <div className="px-4 py-3">
                  <p className="text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap break-words">
                    {entry.message}
                  </p>
                </div>
              )}

              {/* Checklist items */}
              {hasItems && (
                <div className="px-4 pb-3">
                  {entry.message && <div className="border-t border-base-300 mb-3" />}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                      Checklist
                      <span className="ml-1.5 font-normal normal-case text-base-content/30">
                        ({entryItems.filter(i => i.is_resolved).length}/{entryItems.length} resolved)
                      </span>
                    </p>
                    {entryItems.length > 3 && (
                      <button
                        className="text-xs text-primary/60 hover:text-primary flex items-center gap-1"
                        onClick={() => toggleEntry(entry.id)}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Collapse' : `Show all ${entryItems.length}`}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(isExpanded ? entryItems : entryItems.slice(0, 3)).map(item => {
                      const isResolving = resolveNote?.itemId === item.id
                      const isResolvingInProgress = resolvingId === item.id

                      return (
                        <div
                          key={item.id}
                          className={`rounded-lg border transition-colors ${
                            item.is_resolved
                              ? 'bg-success/5 border-success/20'
                              : 'bg-base-50 border-base-300'
                          }`}
                        >
                          <div className="flex items-start gap-3 p-2.5">
                            {/* Checkbox / status */}
                            <button
                              className={`shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                item.is_resolved
                                  ? 'bg-success border-success text-white'
                                  : isAdmin
                                    ? 'border-base-300 bg-base-100 cursor-default'
                                    : 'border-base-300 bg-base-100 hover:border-primary cursor-pointer'
                              }`}
                              onClick={() => {
                                if (isAdmin) return
                                if (item.is_resolved) handleItemUnresolve(item)
                                else handleItemResolve(item)
                              }}
                              disabled={isResolvingInProgress || unresolving === item.id}
                              title={isAdmin ? '' : item.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                            >
                              {(isResolvingInProgress || unresolving === item.id)
                                ? <Loader2 size={10} className="animate-spin" />
                                : item.is_resolved
                                  ? <Check size={11} strokeWidth={3} />
                                  : null
                              }
                            </button>

                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug break-words ${item.is_resolved ? 'line-through text-base-content/40' : 'text-base-content/80'}`}>
                                {item.item_text}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_CLS[item.priority] || PRIORITY_CLS.medium}`}>
                                  {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                                </span>
                                <span className="text-[10px] text-base-content/35 bg-base-200 px-1.5 py-0.5 rounded">
                                  {CATEGORY_LABEL[item.category] || item.category}
                                </span>
                                {item.is_resolved && item.resolved_by_name && (
                                  <span className="text-[10px] text-success/70 flex items-center gap-1">
                                    <Check size={9} strokeWidth={3} />
                                    {item.resolved_by_name}
                                    {item.resolved_at && <span className="text-base-content/30">· {timeAgo(item.resolved_at)}</span>}
                                  </span>
                                )}
                              </div>
                              {item.is_resolved && item.resolution_note && (
                                <p className="text-xs text-success/70 mt-1 italic">"{item.resolution_note}"</p>
                              )}
                            </div>
                          </div>

                          {/* Resolution note input (user only, when marking resolved) */}
                          {!isAdmin && isResolving && !item.is_resolved && (
                            <div className="px-3 pb-3 pt-1 border-t border-base-300/60 bg-base-100">
                              <input
                                type="text"
                                className="input input-bordered input-xs w-full text-xs"
                                placeholder="Add a resolution note (optional)…"
                                value={resolveNote?.note || ''}
                                onChange={e => setResolveNote({ itemId: item.id, note: e.target.value })}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleItemResolve(item)}
                              />
                              <div className="flex gap-2 justify-end mt-2">
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => setResolveNote(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  className={`btn btn-success btn-xs gap-1 ${isResolvingInProgress ? 'loading' : ''}`}
                                  onClick={() => handleItemResolve(item)}
                                >
                                  {!isResolvingInProgress && <Check size={11} />}
                                  Mark Resolved
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Compose section (requester when awaiting, or admin for comments) */}
      {(isAwaitingUserAction && isRequester) || isAdmin ? (
        <div className="mx-4 mb-4 mt-1">
          {!composing ? (
            <div className="flex gap-2">
              <button
                className="btn btn-outline btn-sm gap-2 flex-1"
                onClick={() => setComposing(true)}
              >
                <MessageSquare size={13} />
                {isAdmin ? 'Add Comment' : 'Add Response'}
              </button>
              {/* Submit for re-review (requester only) */}
              {isRequester && isAwaitingUserAction && (
                <button
                  className={`btn btn-success btn-sm gap-2 flex-1 ${resubmitting ? 'loading' : ''}`}
                  onClick={handleResubmit}
                  disabled={resubmitting}
                >
                  {!resubmitting && <RefreshCw size={13} />}
                  {resubmitting ? 'Submitting…' : 'Submit for Re-review'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                className="textarea textarea-bordered w-full text-sm resize-none leading-relaxed"
                rows={3}
                placeholder={
                  isAdmin
                    ? 'Add a comment visible to the requester…'
                    : 'Describe what you\'ve addressed, ask a question, or provide additional context…'
                }
                value={responseText}
                onChange={e => setResponseText(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setComposing(false); setResponseText('') }}
                  disabled={sendingResponse}
                >
                  Cancel
                </button>
                <button
                  className={`btn btn-primary btn-sm gap-2 ${sendingResponse ? 'loading' : ''}`}
                  onClick={handleSendResponse}
                  disabled={!responseText.trim() || sendingResponse}
                >
                  {!sendingResponse && <Send size={13} />}
                  {sendingResponse ? 'Sending…' : 'Send'}
                </button>
                {/* Re-review button alongside response */}
                {isRequester && isAwaitingUserAction && (
                  <button
                    className={`btn btn-success btn-sm gap-2 ${resubmitting ? 'loading' : ''}`}
                    onClick={handleResubmit}
                    disabled={resubmitting}
                  >
                    {!resubmitting && <RefreshCw size={13} />}
                    Re-review
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
