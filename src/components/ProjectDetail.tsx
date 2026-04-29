import React, { useState, useEffect, useRef } from 'react'
import {
  X, Calendar, User, Building2, MapPin, Factory, Hash, Clock,
  FileText, Edit2, History, CheckCircle2, Loader2,
  Paperclip, Upload, Download, Trash2, AlertCircle, File,
  Globe, ListTodo, Tag, PackageOpen, Eye,
} from 'lucide-react'
import type { Project, ProjectCountry, ProjectTask } from '../types'
import {
  formatDate, getStatusColor,
  updateProjectStatus, fetchProjectHistory,
  fetchLookups,
  fetchProjectFiles, uploadProjectFile, deleteProjectFile, getProjectFileUrl,
  formatFileSize, MAX_FILES_PER_PROJECT,
  fetchProjectCountries, fetchProjectTasks,
  fetchDeliveryFiles, uploadDeliveryFile, deleteDeliveryFile,
  updateDeliveryFile, getDeliveryFileUrl, trackDeliveryDownload,
  fetchDeliveryFileDownloads,
  MAX_DELIVERY_FILES,
} from '../lib/data'
import type { AuditEntry, ProjectFile, DeliveryFile, DeliveryFileDownload } from '../lib/data'
import type { LookupItem } from '../types'
import { useAuth } from '../contexts/AuthContext'

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

function fileIcon(fileType: string) {
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('csv'))
    return <File size={16} className="text-green-600" />
  if (fileType.includes('pdf'))
    return <File size={16} className="text-red-500" />
  if (fileType.includes('word') || fileType.includes('document'))
    return <File size={16} className="text-blue-500" />
  return <File size={16} className="text-base-content/50" />
}

export const ProjectDetail: React.FC<{
  project: Project
  onClose: () => void
  onEdit?: () => void
  onStatusUpdated?: (updatedProject: Project) => void
}> = ({ project, onClose, onEdit, onStatusUpdated }) => {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<'details' | 'history' | 'files' | 'delivery'>('details')
  const [statuses, setStatuses] = useState<LookupItem[]>([])
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(project.status_id ?? null)
  const [selectedStatusName, setSelectedStatusName] = useState<string>(project.status)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [localProject, setLocalProject] = useState<Project>(project)

  // ── Countries & Tasks state ──────────────────────────────────────────────────
  const [projectCountries, setProjectCountries] = useState<ProjectCountry[]>([])
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([])

  useEffect(() => {
    fetchProjectCountries(project.id).then(setProjectCountries).catch(() => {})
    fetchProjectTasks(project.id).then(setProjectTasks).catch(() => {})
  }, [project.id])

  // ── Files state ─────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Delivery Files state ─────────────────────────────────────────────────────
  const [deliveryFiles, setDeliveryFiles] = useState<DeliveryFile[]>([])
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryUploading, setDeliveryUploading] = useState(false)
  const [deliveryUploadError, setDeliveryUploadError] = useState<string | null>(null)
  const [deliveryDeletingId, setDeliveryDeletingId] = useState<string | null>(null)
  const [deliveryDownloadingId, setDeliveryDownloadingId] = useState<string | null>(null)
  const [deliveryEditingId, setDeliveryEditingId] = useState<string | null>(null)
  const [deliveryEditName, setDeliveryEditName] = useState('')
  const [deliveryEditDesc, setDeliveryEditDesc] = useState('')
  const [deliveryEditSaving, setDeliveryEditSaving] = useState(false)
  const [expandedDownloadsId, setExpandedDownloadsId] = useState<string | null>(null)
  const [downloadHistory, setDownloadHistory] = useState<DeliveryFileDownload[]>([])
  const [downloadHistoryLoading, setDownloadHistoryLoading] = useState(false)
  const deliveryFileInputRef = useRef<HTMLInputElement>(null)

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

  const loadFiles = async () => {
    setFilesLoading(true)
    const list = await fetchProjectFiles(localProject.id)
    setFiles(list)
    setFilesLoading(false)
  }

  const loadDeliveryFiles = async () => {
    setDeliveryLoading(true)
    const list = await fetchDeliveryFiles(localProject.id)
    setDeliveryFiles(list)
    setDeliveryLoading(false)
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'files') loadFiles()
    if (tab === 'delivery') loadDeliveryFiles()
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

  // ── File handlers ────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setUploadError(null)
    setUploading(true)
    try {
      const newFile = await uploadProjectFile(localProject.id, file, user.id)
      setFiles(prev => [newFile, ...prev])
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected after an error
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (f: ProjectFile) => {
    if (!user?.id) return
    if (!window.confirm(`Delete "${f.file_name}"? This cannot be undone.`)) return
    setDeletingId(f.id)
    try {
      await deleteProjectFile(f.id, f.storage_path, user.id)
      setFiles(prev => prev.filter(x => x.id !== f.id))
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleDownload = async (f: ProjectFile) => {
    setDownloadingId(f.id)
    try {
      const url = await getProjectFileUrl(f.storage_path)
      const a = document.createElement('a')
      a.href = url
      a.download = f.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      alert(`Download failed: ${err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Delivery File handlers ───────────────────────────────────────────────────
  const handleDeliveryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    setDeliveryUploadError(null)
    setDeliveryUploading(true)
    try {
      const newFile = await uploadDeliveryFile(localProject.id, file, user.id)
      setDeliveryFiles(prev => [newFile, ...prev])
    } catch (err: any) {
      setDeliveryUploadError(err.message || 'Upload failed')
    } finally {
      setDeliveryUploading(false)
      if (deliveryFileInputRef.current) deliveryFileInputRef.current.value = ''
    }
  }

  const handleDeliveryDelete = async (f: DeliveryFile) => {
    if (!window.confirm(`Delete delivery file "${f.file_name}"? This cannot be undone.`)) return
    setDeliveryDeletingId(f.id)
    try {
      await deleteDeliveryFile(f.id, f.storage_path)
      setDeliveryFiles(prev => prev.filter(x => x.id !== f.id))
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`)
    } finally {
      setDeliveryDeletingId(null)
    }
  }

  const handleDeliveryDownload = async (f: DeliveryFile) => {
    setDeliveryDownloadingId(f.id)
    try {
      const url = await getDeliveryFileUrl(f.storage_path)
      // Track download
      await trackDeliveryDownload(
        f.id,
        localProject.id,
        user?.id || null,
        user?.email || null,
        (user as any)?.user_metadata?.full_name || user?.email || null
      )
      // Update count locally
      setDeliveryFiles(prev => prev.map(x =>
        x.id === f.id ? { ...x, download_count: (x.download_count || 0) + 1 } : x
      ))
      const a = document.createElement('a')
      a.href = url
      a.download = f.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      alert(`Download failed: ${err.message}`)
    } finally {
      setDeliveryDownloadingId(null)
    }
  }

  const startDeliveryEdit = (f: DeliveryFile) => {
    setDeliveryEditingId(f.id)
    setDeliveryEditName(f.file_name)
    setDeliveryEditDesc(f.description || '')
  }

  const cancelDeliveryEdit = () => {
    setDeliveryEditingId(null)
    setDeliveryEditName('')
    setDeliveryEditDesc('')
  }

  const saveDeliveryEdit = async (f: DeliveryFile) => {
    if (!deliveryEditName.trim()) return
    setDeliveryEditSaving(true)
    try {
      await updateDeliveryFile(f.id, {
        file_name: deliveryEditName.trim(),
        description: deliveryEditDesc.trim() || undefined,
      })
      setDeliveryFiles(prev => prev.map(x =>
        x.id === f.id
          ? { ...x, file_name: deliveryEditName.trim(), description: deliveryEditDesc.trim() || null }
          : x
      ))
      cancelDeliveryEdit()
    } catch (err: any) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setDeliveryEditSaving(false)
    }
  }

  const toggleDownloadHistory = async (fileId: string) => {
    if (expandedDownloadsId === fileId) {
      setExpandedDownloadsId(null)
      return
    }
    setExpandedDownloadsId(fileId)
    setDownloadHistoryLoading(true)
    const history = await fetchDeliveryFileDownloads(fileId)
    setDownloadHistory(history)
    setDownloadHistoryLoading(false)
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
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${tab === 'details' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('details')}
        >
          <FileText size={13} /> Details
        </button>
        <button
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${tab === 'history' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('history')}
        >
          <History size={13} /> History
        </button>
        <button
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${tab === 'files' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('files')}
        >
          <Paperclip size={13} />
          Files
          {files.length > 0 && (
            <span className="badge badge-xs badge-primary ml-0.5">{files.length}</span>
          )}
        </button>
        <button
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${tab === 'delivery' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('delivery')}
        >
          <PackageOpen size={13} />
          Delivery
          {deliveryFiles.length > 0 && (
            <span className="badge badge-xs badge-secondary ml-0.5">{deliveryFiles.length}</span>
          )}
        </button>
      </div>

      {/* Details Tab */}
      {tab === 'details' && (
        <div className="flex-1 overflow-y-auto">
          {/* Status Change Panel — Admin only */}
          {isAdmin && (
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
          )}

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
            <Field icon={<Tag size={14} />} label="Project Type" value={localProject.project_type} />

            {/* Multi-country breakdown */}
            {projectCountries.length > 1 ? (
              <div className="flex items-start gap-3 py-2">
                <span className="mt-0.5 opacity-40"><Globe size={14} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-base-content/50 uppercase tracking-wider mb-1">Countries</div>
                  <div className="flex flex-col gap-1">
                    {projectCountries.map(c => (
                      <div key={c.country_id} className="flex items-center justify-between text-sm">
                        <span>{c.country_name}</span>
                        {c.job_count != null && (
                          <span className="text-xs text-base-content/40 ml-2">{c.job_count.toLocaleString()} jobs</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Field icon={<MapPin size={14} />} label="Country" value={localProject.country} />
            )}

            <div className="divider my-1"></div>
            <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1">Timeline</div>
            <Field icon={<Calendar size={14} />} label="Date Received" value={formatDate(localProject.date_received)} />
            <Field icon={<Calendar size={14} />} label="Expected Delivery" value={formatDate(localProject.expected_delivery_date)} />
            <Field icon={<Calendar size={14} />} label="Date Delivered" value={formatDate(localProject.date_delivered)} />
            <Field icon={<Clock size={14} />} label="Days to Complete" value={localProject.days_to_complete != null ? `${localProject.days_to_complete} days` : null} />
            <Field icon={<Hash size={14} />} label="Job Count" value={localProject.job_count} />
            <Field icon={<Hash size={14} />} label="ID #" value={localProject.id_number ?? null} />
            {localProject.time_allocation != null && (
              <Field icon={<Clock size={14} />} label="Time Allocation" value={`${localProject.time_allocation} hrs`} />
            )}

            {/* Additional Requests / Tasks */}
            {projectTasks.length > 0 && (
              <>
                <div className="divider my-1"></div>
                <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1">Additional Requests</div>
                <div className="flex flex-col gap-2 mt-1">
                  {projectTasks.map((task, i) => (
                    <div key={task.id || i} className="flex items-start gap-2 p-2.5 bg-base-200 rounded-lg">
                      <ListTodo size={13} className="mt-0.5 text-primary/60 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        {task.description && <p className="text-xs text-base-content/50 mt-0.5">{task.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
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

      {/* Files Tab */}
      {tab === 'files' && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Upload bar */}
          <div className="p-4 border-b border-base-300 bg-base-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                Attachments
              </div>
              <div className="text-xs text-base-content/40">
                {files.length}/{MAX_FILES_PER_PROJECT} files · max 2 MB each
              </div>
            </div>

            {/* Upload error */}
            {uploadError && (
              <div className="flex items-start gap-2 p-2 mb-2 rounded-lg bg-error/10 text-error text-xs">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip"
              onChange={handleFileSelect}
            />
            <button
              className={`btn btn-sm btn-outline btn-primary w-full gap-2 ${uploading ? 'loading' : ''}`}
              onClick={() => { setUploadError(null); fileInputRef.current?.click() }}
              disabled={uploading || files.length >= MAX_FILES_PER_PROJECT}
            >
              {!uploading && <Upload size={14} />}
              {uploading ? 'Uploading…' : files.length >= MAX_FILES_PER_PROJECT ? 'File limit reached' : 'Upload File'}
            </button>

            <p className="text-xs text-base-content/30 mt-1.5 text-center">
              Supports: Excel, CSV, PDF, Word, images, ZIP
            </p>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto p-4">
            {filesLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12">
                <Paperclip size={32} className="mx-auto text-base-content/20 mb-2" />
                <p className="text-sm text-base-content/40">No files attached yet</p>
                <p className="text-xs text-base-content/30 mt-1">Upload Excel, CSV, or other documents</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map(f => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 border border-base-300 rounded-lg bg-base-50 hover:bg-base-100 transition-colors group"
                  >
                    {/* File type icon */}
                    <div className="shrink-0">{fileIcon(f.file_type)}</div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-base-content truncate" title={f.file_name}>
                        {f.file_name}
                      </div>
                      <div className="text-xs text-base-content/40 mt-0.5">
                        {formatFileSize(f.file_size)}
                        {f.uploader_name && <> · <span className="text-base-content/50">{f.uploader_name}</span></>}
                      </div>
                      <div className="text-xs text-base-content/30 mt-0.5" title={new Date(f.created_at).toLocaleString()}>
                        {timeAgo(f.created_at)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="btn btn-ghost btn-xs btn-circle tooltip tooltip-left"
                        data-tip="Download"
                        onClick={() => handleDownload(f)}
                        disabled={downloadingId === f.id}
                      >
                        {downloadingId === f.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Download size={13} />
                        }
                      </button>
                      <button
                        className="btn btn-ghost btn-xs btn-circle text-error/70 hover:text-error hover:bg-error/10 tooltip tooltip-left"
                        data-tip="Delete"
                        onClick={() => handleDelete(f)}
                        disabled={deletingId === f.id}
                      >
                        {deletingId === f.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delivery Files Tab */}
      {tab === 'delivery' && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Header + upload (admin only) */}
          <div className="p-4 border-b border-base-300 bg-base-50">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
                  Delivery Files
                </div>
                <div className="text-xs text-base-content/30 mt-0.5">
                  Files delivered to the requestor
                </div>
              </div>
              <div className="text-xs text-base-content/40">
                {deliveryFiles.length}/{MAX_DELIVERY_FILES} · max 2 MB
              </div>
            </div>

            {deliveryUploadError && (
              <div className="flex items-start gap-2 p-2 mb-2 rounded-lg bg-error/10 text-error text-xs">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{deliveryUploadError}</span>
              </div>
            )}

            {/* Admin upload button */}
            {isAdmin && (
              <>
                <input
                  ref={deliveryFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip"
                  onChange={handleDeliveryFileSelect}
                />
                <button
                  className={`btn btn-sm btn-outline btn-secondary w-full gap-2 ${deliveryUploading ? 'loading' : ''}`}
                  onClick={() => { setDeliveryUploadError(null); deliveryFileInputRef.current?.click() }}
                  disabled={deliveryUploading || deliveryFiles.length >= MAX_DELIVERY_FILES}
                >
                  {!deliveryUploading && <Upload size={14} />}
                  {deliveryUploading ? 'Uploading…' : deliveryFiles.length >= MAX_DELIVERY_FILES ? 'File limit reached' : 'Upload Delivery File'}
                </button>
              </>
            )}

            {!isAdmin && (
              <div className="text-xs text-base-content/30 text-center py-1">
                Files uploaded here by your analyst will appear below for download
              </div>
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto p-4">
            {deliveryLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : deliveryFiles.length === 0 ? (
              <div className="text-center py-12">
                <PackageOpen size={32} className="mx-auto text-base-content/20 mb-2" />
                <p className="text-sm text-base-content/40">No delivery files yet</p>
                <p className="text-xs text-base-content/30 mt-1">
                  {isAdmin ? 'Upload completed deliverables for this project' : 'Your analyst will upload completed files here'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {deliveryFiles.map(f => (
                  <div key={f.id} className="border border-base-300 rounded-lg bg-base-50">
                    {/* File row */}
                    {deliveryEditingId === f.id ? (
                      /* Edit mode */
                      <div className="p-3 space-y-2">
                        <input
                          className="input input-bordered input-sm w-full"
                          value={deliveryEditName}
                          onChange={e => setDeliveryEditName(e.target.value)}
                          placeholder="File name"
                        />
                        <input
                          className="input input-bordered input-sm w-full"
                          value={deliveryEditDesc}
                          onChange={e => setDeliveryEditDesc(e.target.value)}
                          placeholder="Description (optional)"
                        />
                        <div className="flex gap-2 justify-end">
                          <button className="btn btn-xs btn-ghost" onClick={cancelDeliveryEdit} disabled={deliveryEditSaving}>
                            Cancel
                          </button>
                          <button
                            className={`btn btn-xs btn-primary gap-1 ${deliveryEditSaving ? 'loading' : ''}`}
                            onClick={() => saveDeliveryEdit(f)}
                            disabled={!deliveryEditName.trim() || deliveryEditSaving}
                          >
                            {!deliveryEditSaving && <CheckCircle2 size={11} />}
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal view */
                      <div className="flex items-center gap-3 p-3 hover:bg-base-100 transition-colors rounded-lg">
                        <div className="shrink-0">{fileIcon(f.file_type || '')}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-base-content truncate" title={f.file_name}>
                            {f.file_name}
                          </div>
                          {f.description && (
                            <div className="text-xs text-base-content/50 mt-0.5 truncate">{f.description}</div>
                          )}
                          <div className="text-xs text-base-content/40 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{formatFileSize(f.file_size)}</span>
                            {f.uploader_name && <><span>·</span><span>{f.uploader_name}</span></>}
                            <span>·</span>
                            <span title={new Date(f.uploaded_at).toLocaleString()}>{timeAgo(f.uploaded_at)}</span>
                            {(f.download_count || 0) > 0 && (
                              <><span>·</span><span className="text-success">{f.download_count} download{f.download_count !== 1 ? 's' : ''}</span></>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Download — all users */}
                          <button
                            className="btn btn-ghost btn-xs btn-circle tooltip tooltip-left"
                            data-tip="Download"
                            onClick={() => handleDeliveryDownload(f)}
                            disabled={deliveryDownloadingId === f.id}
                          >
                            {deliveryDownloadingId === f.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Download size={13} />
                            }
                          </button>
                          {/* Admin only: edit, download history, delete */}
                          {isAdmin && (
                            <>
                              <button
                                className="btn btn-ghost btn-xs btn-circle tooltip tooltip-left"
                                data-tip="Edit name/description"
                                onClick={() => startDeliveryEdit(f)}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                className="btn btn-ghost btn-xs btn-circle tooltip tooltip-left"
                                data-tip="Download history"
                                onClick={() => toggleDownloadHistory(f.id)}
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                className="btn btn-ghost btn-xs btn-circle text-error/70 hover:text-error hover:bg-error/10 tooltip tooltip-left"
                                data-tip="Delete"
                                onClick={() => handleDeliveryDelete(f)}
                                disabled={deliveryDeletingId === f.id}
                              >
                                {deliveryDeletingId === f.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <Trash2 size={13} />
                                }
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Download history (admin, expandable) */}
                    {isAdmin && expandedDownloadsId === f.id && (
                      <div className="border-t border-base-300 p-3 bg-base-100 rounded-b-lg">
                        <div className="text-xs font-semibold text-base-content/40 uppercase tracking-wider mb-2">
                          Download History
                        </div>
                        {downloadHistoryLoading ? (
                          <div className="flex items-center gap-2 text-xs text-base-content/40">
                            <Loader2 size={12} className="animate-spin" /> Loading…
                          </div>
                        ) : downloadHistory.length === 0 ? (
                          <p className="text-xs text-base-content/30 italic">No downloads yet</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {downloadHistory.map(d => (
                              <div key={d.id} className="flex items-center justify-between text-xs">
                                <span className="text-base-content/70">
                                  {d.downloaded_by_name || d.downloaded_by_email || 'Unknown user'}
                                </span>
                                <span className="text-base-content/40" title={new Date(d.downloaded_at).toLocaleString()}>
                                  {timeAgo(d.downloaded_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
