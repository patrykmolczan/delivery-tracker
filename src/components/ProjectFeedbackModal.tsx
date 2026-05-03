import React, { useState, useRef } from 'react'
import {
  X, Clock, MessageSquare, XCircle, Plus, Trash2,
  Bell, AlertTriangle, CheckCircle2,
} from 'lucide-react'

export type FeedbackActionType = 'hold' | 'request_changes' | 'reject'

export interface FeedbackItemDraft {
  id: string
  item_text: string
  category: 'template' | 'information' | 'documentation' | 'data_quality' | 'other'
  priority: 'high' | 'medium' | 'low'
}

interface Props {
  projectName: string
  currentStatus: string
  onSubmit: (params: {
    actionType: FeedbackActionType
    message: string
    items: Omit<FeedbackItemDraft, 'id'>[]
    notifyRequester: boolean
    statusChangeToId: number | null
    statusChangeToName: string | null
  }) => Promise<void>
  onClose: () => void
}

const ACTION_CONFIG: Record<FeedbackActionType, {
  label: string
  icon: React.ElementType
  accentClass: string
  headerGradient: string
  badgeClass: string
  statusId: number | null
  statusName: string | null
  placeholder: string
  description: string
}> = {
  hold: {
    label: 'Put On Hold',
    icon: Clock,
    accentClass: 'text-warning border-warning/40 bg-warning/10',
    headerGradient: 'from-warning/20 via-warning/10 to-transparent',
    badgeClass: 'badge-warning',
    statusId: 5,
    statusName: 'On Hold',
    placeholder: 'Explain why this project is being put on hold and what needs to happen before it can proceed…',
    description: 'Project status will change to On Hold. Requester will be notified of required changes.',
  },
  request_changes: {
    label: 'Request Changes',
    icon: MessageSquare,
    accentClass: 'text-info border-info/40 bg-info/10',
    headerGradient: 'from-info/20 via-info/10 to-transparent',
    badgeClass: 'badge-info',
    statusId: null,
    statusName: null,
    placeholder: 'Describe the changes needed. Be specific about what is missing or incorrect…',
    description: 'Project status stays unchanged. Requester will see a detailed list of required changes.',
  },
  reject: {
    label: 'Reject Project',
    icon: XCircle,
    accentClass: 'text-error border-error/40 bg-error/10',
    headerGradient: 'from-error/20 via-error/10 to-transparent',
    badgeClass: 'badge-error',
    statusId: 7,
    statusName: 'Cancelled',
    placeholder: 'Explain the reason for rejection and what criteria were not met…',
    description: 'Project status will change to Cancelled. This action is significant — use only when the project cannot proceed.',
  },
}

const CATEGORIES: { value: FeedbackItemDraft['category']; label: string }[] = [
  { value: 'template', label: 'Template Issue' },
  { value: 'information', label: 'Missing Info' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'data_quality', label: 'Data Quality' },
  { value: 'other', label: 'Other' },
]

const PRIORITY_CONFIG: Record<FeedbackItemDraft['priority'], { label: string; cls: string; dot: string }> = {
  high: { label: 'High', cls: 'text-error bg-error/10 border-error/20', dot: 'bg-error' },
  medium: { label: 'Medium', cls: 'text-warning bg-warning/10 border-warning/20', dot: 'bg-warning' },
  low: { label: 'Low', cls: 'text-base-content/50 bg-base-200 border-base-300', dot: 'bg-base-content/30' },
}

function uid() { return Math.random().toString(36).slice(2) }

export const ProjectFeedbackModal: React.FC<Props> = ({
  projectName, currentStatus, onSubmit, onClose,
}) => {
  const [actionType, setActionType] = useState<FeedbackActionType>('hold')
  const [message, setMessage] = useState('')
  const [items, setItems] = useState<FeedbackItemDraft[]>([])
  const [newItemText, setNewItemText] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<FeedbackItemDraft['category']>('template')
  const [newItemPriority, setNewItemPriority] = useState<FeedbackItemDraft['priority']>('high')
  const [notifyRequester, setNotifyRequester] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const itemInputRef = useRef<HTMLInputElement>(null)

  const cfg = ACTION_CONFIG[actionType]
  const ActionIcon = cfg.icon

  const addItem = () => {
    const text = newItemText.trim()
    if (!text) return
    setItems(prev => [...prev, {
      id: uid(),
      item_text: text,
      category: newItemCategory,
      priority: newItemPriority,
    }])
    setNewItemText('')
    itemInputRef.current?.focus()
  }

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const handleSubmit = async () => {
    if (!message.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        actionType,
        message: message.trim(),
        items: items.map(({ id, ...rest }) => rest),
        notifyRequester,
        statusChangeToId: cfg.statusId,
        statusChangeToName: cfg.statusName,
      })
    } catch (err: any) {
      setError(err.message || 'Submission failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
      />
      <div className="relative bg-base-100 rounded-2xl shadow-2xl w-full max-w-xl border border-base-300 overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className={`bg-gradient-to-br ${cfg.headerGradient} border-b border-base-300 px-6 py-5 shrink-0`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${cfg.accentClass}`}>
              <ActionIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight">Project Review Action</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-base-content/60 truncate">{projectName}</span>
                <span className="text-base-content/30">·</span>
                <span className="text-xs text-base-content/40">Current: {currentStatus}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm btn-circle shrink-0" onClick={onClose} disabled={submitting}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Action type selector */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">Action Type</p>
            <div className="flex gap-2 p-1 bg-base-200 rounded-xl">
              {(Object.keys(ACTION_CONFIG) as FeedbackActionType[]).map(type => {
                const c = ACTION_CONFIG[type]
                const Icon = c.icon
                const isActive = actionType === type
                return (
                  <button
                    key={type}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? `bg-base-100 shadow-sm border ${c.accentClass}`
                        : 'text-base-content/50 hover:text-base-content/80'
                    }`}
                    onClick={() => setActionType(type)}
                  >
                    <Icon size={13} />
                    {c.label}
                  </button>
                )
              })}
            </div>
            {/* Description */}
            <div className={`mt-2 flex items-start gap-2 p-2.5 rounded-lg border text-xs ${cfg.accentClass}`}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0 opacity-70" />
              <span className="leading-relaxed opacity-80">{cfg.description}</span>
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/40 block mb-2">
              Message to Requester <span className="text-error">*</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full text-sm leading-relaxed resize-none"
              rows={4}
              placeholder={cfg.placeholder}
              value={message}
              onChange={e => setMessage(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-base-content/30 mt-1">
              Be clear and constructive. Requesters see this message in full.
            </p>
          </div>

          {/* Checklist builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                Action Checklist <span className="text-base-content/25 font-normal normal-case">(optional)</span>
              </label>
              {items.length > 0 && (
                <span className="badge badge-sm badge-primary">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Add item row */}
            <div className="flex gap-2 mb-3">
              <input
                ref={itemInputRef}
                type="text"
                className="input input-bordered input-sm flex-1 text-sm"
                placeholder="Describe a specific issue or required fix…"
                value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
              />
              {/* Category */}
              <select
                className="select select-bordered select-sm text-xs w-36"
                value={newItemCategory}
                onChange={e => setNewItemCategory(e.target.value as FeedbackItemDraft['category'])}
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {/* Priority */}
              <select
                className="select select-bordered select-sm text-xs w-24"
                value={newItemPriority}
                onChange={e => setNewItemPriority(e.target.value as FeedbackItemDraft['priority'])}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                className="btn btn-sm btn-primary gap-1 shrink-0"
                onClick={addItem}
                disabled={!newItemText.trim()}
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Items list */}
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, idx) => {
                  const pCfg = PRIORITY_CONFIG[item.priority]
                  const cat = CATEGORIES.find(c => c.value === item.category)
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-2.5 bg-base-200 rounded-lg border border-base-300 group"
                    >
                      <span className="text-xs text-base-content/30 font-mono shrink-0 w-4">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-base-content break-words">{item.item_text}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pCfg.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                            {pCfg.label}
                          </span>
                          <span className="text-[10px] text-base-content/40 bg-base-300 px-1.5 py-0.5 rounded">
                            {cat?.label}
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4 border border-dashed border-base-300 rounded-xl">
                <p className="text-xs text-base-content/30">No checklist items yet — add specific items the requester needs to address</p>
              </div>
            )}
          </div>

          {/* Notify toggle */}
          <div className="flex items-center justify-between p-3.5 bg-base-200 rounded-xl border border-base-300">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${notifyRequester ? 'bg-success/15 text-success' : 'bg-base-300 text-base-content/30'}`}>
                <Bell size={14} />
              </div>
              <div>
                <p className="text-sm font-medium">Notify Requester</p>
                <p className="text-xs text-base-content/40">
                  {notifyRequester ? 'Requester will receive an email with this feedback' : 'No email will be sent'}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-success"
              checked={notifyRequester}
              onChange={e => setNotifyRequester(e.target.checked)}
            />
          </div>

          {error && (
            <div className="p-3 bg-error/10 rounded-xl text-sm text-error border border-error/20">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex gap-3 px-6 py-4 bg-base-50 border-t border-base-300 justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-xs text-base-content/40">
            {cfg.statusName && (
              <>
                <span>Status will change to</span>
                <span className={`badge badge-sm ${cfg.badgeClass}`}>{cfg.statusName}</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              className={`btn btn-sm gap-2 ${submitting ? 'loading' : ''} ${
                actionType === 'reject' ? 'btn-error' :
                actionType === 'hold' ? 'btn-warning' : 'btn-info'
              }`}
              onClick={handleSubmit}
              disabled={!message.trim() || submitting}
            >
              {!submitting && <ActionIcon size={14} />}
              {submitting ? 'Submitting…' : cfg.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
