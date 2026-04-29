import React, { useState, useEffect } from 'react'
import { X, Calendar, User, Building2, MapPin, Factory, Hash, Clock, FileText, Edit2, History, CheckCircle2, Loader2 } from 'lucide-react'
import type { Project } from '../types'
import { formatDate, getStatusColor, updateProjectStatus, fetchProjectHistory, fetchLookups } from '../lib/data'
import type { AuditEntry } from '../lib/data'
import type { LookupItem } from '../types'

interface FieldProps {
  icon: React.ReactNode
  label: string
  value: string | number | null
  highlight?: boolean
}

const Field: React.FC<FieldProps> = ({ icon, label, value, highlight }) => (
  <div className="flex items-start gap-3 py-2">
    <span className="mt-0.5 opacity-40">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className="text-xs text-base-content/50 uppercase tracking-wider">{label}</div>
      <div className={`text-sm ${highlight ? 'text-primary font-semibold' : 'text-base-content'} break-words`}>{value ?? '—'}</div>
    </div>
  </div>
)


function actionBadge(action: string) {
  if (action === 'INSERT') return <span className="badge badge-success badge-xs whitespace-nowrap">Created</span>
  if (action === 'UPDATE') return <span className="badge badge-info badge-xs whitespace-nowrap">Updated</span>
  if (action === 'DELETE') return <span className="badge badge-error badge-xs whitespace-nowrap">Deleted</span>
  return <span className="badge badge-ghost badge-xs whitespace-nowrap">{action}</span>
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

export const ProjectDetail: React.FC<{
  project: Project
  onClose: () => void
  onEdit?: () => void
  onStatusUpdated?: (updatedProject: Project) => void
}> = ({ project, onClose, onEdit, onStatusUpdated }) => {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [statuses, setStatuses] = useState<LookupItem[]>([])
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(project.status_id ?? null)
  const [selectedStatusName, setSelectedStatusName] = useState<string>(project.status)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [localProject, setLocalProject] = useState<Project>(project)

  // Completed / Ready to Deliver statuses auto-fill delivered date
  const DELIVERED_STATUSES = ['Completed', 'Ready to Deliver']
  const willMarkDelivered = DELIVERED_STATUSES.includes(selectedStatusName) && !localProject.date_delivered

  useEffect(() => {
    fetchLookups().then(l => setStatuses(l.statuses)).catch(() => {})
  }, [])

  useEffect(() => {
    setLocalProject(project)
    setSelectedStatusId(project.status_id ?? null)
    setSelectedStatusName(project.status)
    setStatusSuccess(false)
    setStatusError(null)
  }, [project])

  const loadHistory = async () => {
    setHistoryLoading(true)
    const entries = await fetchProjectHistory(localProject.id)
    setHistory(entries)
    setHistoryLoading(false)
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab, localProject.id])

  const handleStatusChange = (statusId: number, statusName: string) => {
    setSelectedStatusId(statusId)
    setSelectedStatusName(statusName)
    setStatusSuccess(false)
    setStatusError(null)
  }

  const handleSaveStatus = async () => {
    if (!selectedStatusId || selectedStatusId === localProject.status_id) return
    setSavingStatus(true)
    setStatusError(null)
    try {
      const { date_delivered, days_to_complete } = await updateProjectStatus(
        localProject.id,
        selectedStatusId,
        localProject.date_received,
        willMarkDelivered
      )
      const updated: Project = {
        ...localProject,
        status: selectedStatusName,
        status_id: selectedStatusId,
        date_delivered: willMarkDelivered ? date_delivered : localProject.date_delivered,
        days_to_complete: willMarkDelivered ? days_to_complete : localProject.days_to_complete,
      }
      setLocalProject(updated)
      setStatusSuccess(true)
      onStatusUpdated?.(updated)
      setTimeout(() => setStatusSuccess(false), 3000)
      // Reload history to show the change
      if (tab === 'history') loadHistory()
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update status')
    } finally {
      setSavingStatus(false)
    }
  }

  const isOverdue = () => {
    if (['Completed', 'Cancelled'].includes(localProject.status)) return false
    if (!localProject.expected_delivery_date) return false
    return localProject.expected_delivery_date < new Date().toISOString().slice(0, 10)
  }

  const statusChanged = selectedStatusId !== localProject.status_id

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-base-100 border-l border-base-300 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-base-300 bg-base-200">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base-content truncate">{localProject.client_name}</h3>
          <div className="flex items-center gap-1 mt-1">
            <span className={`badge badge-sm ${getStatusColor(localProject.status)} whitespace-nowrap`}>{localProject.status}</span>
            {isOverdue() && <span className="badge badge-sm badge-error whitespace-nowrap">Overdue</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button className="btn btn-ghost btn-sm gap-1.5" onClick={onEdit}>
              <Edit2 size={14} /> Edit
            </button>
          )}
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-base-300 bg-base-200">
        <button
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'details' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('details')}
        >
          <FileText size={14} /> Details
        </button>
        <button
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'history' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('history')}
        >
          <History size={14} /> History
        </button>
      </div>

      {/* Details Tab */}
      {tab === 'details' && (
        <div className="flex-1 overflow-y-auto">
          {/* Status Change Panel */}
          <div className="p-4 border-b border-base-300 bg-base-50">
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">Quick Status Update</div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <select
                  className="select select-bordered select-sm w-full pr-8"
                  value={selectedStatusId ?? ''}
                  onChange={e => {
                    const id = parseInt(e.target.value)
                    const name = statuses.find(s => s.id === id)?.name || ''
                    handleStatusChange(id, name)
                  }}
                >
                  {statuses.length === 0
                    ? <option value={localProject.status_id ?? ''}>{localProject.status}</option>
                    : statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  }
                </select>
              </div>
              <button
                className={`btn btn-sm btn-primary gap-1.5 ${savingStatus ? 'loading' : ''}`}
                onClick={handleSaveStatus}
                disabled={!statusChanged || savingStatus}
              >
                {!savingStatus && <CheckCircle2 size={14} />}
                Save
              </button>
            </div>
            {willMarkDelivered && statusChanged && (
              <div className="mt-2 text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 size={12} />
                Will auto-fill today as Delivered Date and calculate days to complete
              </div>
            )}
            {statusSuccess && (
              <div className="mt-2 text-xs text-success flex items-center gap-1.5">
                <CheckCircle2 size={12} />
                Status updated successfully!
              </div>
            )}
            {statusError && (
              <div className="mt-2 text-xs text-error">{statusError}</div>
            )}
          </div>

          {/* Fields */}
          <div className="p-4 space-y-1">
            {localProject.project_summary && (
              <div className="p-3 bg-base-200 rounded-lg mb-3">
                <div className="flex items-center gap-2 text-xs text-base-content/50 uppercase tracking-wider mb-1"><FileText size={12} /> Project Summary</div>
                <p className="text-sm text-base-content">{localProject.project_summary}</p>
              </div>
            )}
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1">People</div>
            <Field icon={<User size={14} />} label="Project Owner" value={localProject.project_owner} highlight />
            <Field icon={<User size={14} />} label="Analyst" value={localProject.analyst} />
            <Field icon={<User size={14} />} label="Requestor" value={localProject.requestor} />
            <div className="divider my-1"></div>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1">Client</div>
            <Field icon={<Building2 size={14} />} label="Client Type" value={localProject.client_type} />
            <Field icon={<Building2 size={14} />} label="Client Name" value={localProject.client_name} />
            <Field icon={<Factory size={14} />} label="Industry" value={localProject.industry} />
            <Field icon={<MapPin size={14} />} label="Country" value={localProject.country} />
            <div className="divider my-1"></div>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1">Timeline</div>
            <Field icon={<Calendar size={14} />} label="Date Received" value={formatDate(localProject.date_received)} />
            <Field icon={<Calendar size={14} />} label="Expected Delivery" value={formatDate(localProject.expected_delivery_date)} />
            <Field icon={<Calendar size={14} />} label="Date Delivered" value={formatDate(localProject.date_delivered)} />
            <Field icon={<Clock size={14} />} label="Days to Complete" value={localProject.days_to_complete != null ? `${localProject.days_to_complete} days` : null} />
            <Field icon={<Hash size={14} />} label="Job Count" value={localProject.job_count} />
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto p-4">
          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <History size={32} className="mx-auto text-base-content/20 mb-2" />
              <p className="text-sm text-base-content/40">No history recorded yet</p>
              <p className="text-xs text-base-content/30 mt-1">Changes will appear here after edits</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry, i) => {
                const who = entry.user_id ? `User …${entry.user_id.slice(-6)}` : 'System'
                const fieldLabel = entry.field_changed
                  ? entry.field_changed.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                  : null
                return (
                  <div key={entry.id || i} className="border border-base-300 rounded-lg p-3 bg-base-50 text-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {actionBadge(entry.action)}
                        <span className="font-medium text-base-content text-xs">{who}</span>
                      </div>
                      <span className="text-xs text-base-content/40" title={new Date(entry.created_at).toLocaleString()}>
                        {timeAgo(entry.created_at)}
                      </span>
                    </div>
                    {entry.action === 'INSERT' ? (
                      <p className="text-xs text-base-content/40 italic">Project created</p>
                    ) : entry.action === 'DELETE' ? (
                      <p className="text-xs text-base-content/40 italic">Project deleted</p>
                    ) : fieldLabel ? (
                      <p className="text-xs text-base-content/70">
                        <span className="font-medium">{fieldLabel}</span>
                        {' '}changed
                        {entry.old_value ? <span className="text-error"> from <em>{entry.old_value}</em></span> : ''}
                        {entry.new_value ? <span className="text-success"> to <em>{entry.new_value}</em></span> : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-base-content/40 italic">No tracked field changes</p>
                    )}
                    <div className="text-xs text-base-content/30 mt-1.5">
                      {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
