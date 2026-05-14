import React, { useState, useEffect, useRef } from 'react'
import {
  X, Calendar, User, Building2, MapPin, Factory, Hash, Clock,
  FileText, Edit2, History, CheckCircle2, Loader2,
  Paperclip, Upload, Download, Trash2, AlertCircle, File,
  Globe, ListTodo, Tag, PackageOpen, Eye, Bell, BellOff,
  MessageSquare, Plus, Send, Zap, XCircle, ShieldAlert,
} from 'lucide-react'
import type { Project, ProjectCountry, ProjectTask, ProjectETAHistory, ProjectFeedback, ProjectFeedbackItem } from '../types'
import {
  formatDate, getStatusColor,
  updateProjectStatus, fetchProjectHistory,
  fetchLookups,
  fetchProjectFiles, uploadProjectFile, deleteProjectFile, getProjectFileUrl,
  formatFileSize, MAX_FILES_PER_PROJECT,
  fetchProjectCountries, fetchProjectTasks,
  fetchProjectETAData, updateProjectETA, fetchProjectETAHistory,
  fetchDeliveryFiles, uploadDeliveryFile, deleteDeliveryFile,
  updateDeliveryFile, getDeliveryFileUrl, trackDeliveryDownload,
  fetchDeliveryFileDownloads,
  MAX_DELIVERY_FILES,
} from '../lib/data'
import type { AuditEntry, ProjectFile, DeliveryFile, DeliveryFileDownload, DeliveryNote } from '../lib/data'
import RichTextEditor, { isRichTextEmpty, type RichTextEditorRef } from './RichTextEditor'
import {
  fetchDeliveryNotes, createDeliveryNote, updateDeliveryNote, deleteDeliveryNote,
  deleteProject, fetchProjectFeedback, fetchProjectFeedbackUnresolvedCount,
  createProjectFeedback, resolveProjectFeedbackItem, unresolveProjectFeedbackItem,
  submitProjectResponse, submitForReReview,
  createNotification, createNotificationsForAdmins,
} from '../lib/data'
import type { LookupItem } from '../types'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchNotificationSettings,
  updateProjectNotificationsEnabled,
  fetchProjectOwnerEmail,
} from '../lib/data'
import { sendNotification } from '../lib/notifications'
import { DeleteProjectModal } from './DeleteProjectModal'
import { ProjectFeedbackModal } from './ProjectFeedbackModal'
import type { FeedbackActionType } from './ProjectFeedbackModal'
import { FeedbackThread } from './FeedbackThread'
import { TextPresets } from './TextPresets'


/** Strip dangerous elements/attributes from TipTap-generated HTML before render. */
function sanitizeNoteHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script, iframe, object, embed, form, input, link, svg').forEach(el => el.remove())
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (
          attr.name.startsWith('on') ||
          (attr.name === 'href' && /^\s*(javascript:|data:)/i.test(attr.value)) ||
          (attr.name === 'src'  && /^\s*(javascript:|data:)/i.test(attr.value))
        ) {
          el.removeAttribute(attr.name)
        }
      })
    })
    return doc.body.innerHTML
  } catch {
    return ''
  }
}

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

function getExpiryBadge(expiresAt: string | null | undefined): { label: string; title: string; cls: string } | null {
  if (!expiresAt) return null
  const now = new Date()
  const exp = new Date(expiresAt)
  const msLeft = exp.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
  const fullDate = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (daysLeft <= 0) {
    return { label: '⚠ Expired', title: `Expired on ${fullDate}`, cls: 'text-error font-semibold' }
  }
  if (daysLeft <= 14) {
    return { label: `Expires in ${daysLeft}d`, title: `Expires ${fullDate} — download soon`, cls: 'text-error' }
  }
  if (daysLeft <= 30) {
    return { label: `Expires in ${daysLeft}d`, title: `Expires ${fullDate}`, cls: 'text-warning' }
  }
  if (daysLeft <= 90) {
    return { label: `Expires in ~${Math.round(daysLeft / 30)}mo`, title: `Expires ${fullDate}`, cls: 'text-warning/70' }
  }
  return { label: `Expires ${fullDate}`, title: `Auto-expires ${fullDate}`, cls: 'text-base-content/35' }
}

export const ProjectDetail: React.FC<{
  project: Project
  onClose: () => void
  onEdit?: () => void
  onStatusUpdated?: (updatedProject: Project) => void
  onDelete?: () => void
  defaultTab?: 'details' | 'history' | 'files' | 'delivery' | 'review'
}> = ({ project, onClose, onEdit, onStatusUpdated, onDelete, defaultTab }) => {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<'details' | 'history' | 'files' | 'delivery' | 'review'>(defaultTab ?? 'details')
  const [statuses, setStatuses] = useState<LookupItem[]>([])
  const [selectedStatusId, setSelectedStatusId] = useState<number | null>(project.status_id ?? null)
  const [selectedStatusName, setSelectedStatusName] = useState<string>(project.status)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSuccess, setStatusSuccess] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [history, setHistory] = useState<AuditEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [localProject, setLocalProject] = useState<Project>(project)

  // ── Notification state ────────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>({})
  const [notifToggling, setNotifToggling] = useState(false)
  const [notifSent, setNotifSent] = useState(false)

  // ── Countries & Tasks state ──────────────────────────────────────────────────
  const [projectCountries, setProjectCountries] = useState<ProjectCountry[]>([])
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([])

  // ── AI ETA state ───────────────────────────────────────────────────────────
  const [etaData, setEtaData] = useState<{
    ai_eta_days: number | null
    ai_eta_confidence: string | null
    ai_eta_breakdown: string | null
    ai_eta_override_days: number | null
    ai_eta_override_by: string | null
    ai_eta_override_at: string | null
    ai_eta_override_reason: string | null
  } | null>(null)
  const [etaHistory, setEtaHistory] = useState<ProjectETAHistory[]>([])
  const [etaEditing, setEtaEditing] = useState(false)
  const [etaNewDays, setEtaNewDays] = useState('')
  const [etaReason, setEtaReason] = useState('')
  const [etaNotify, setEtaNotify] = useState(false)
  const [etaSaving, setEtaSaving] = useState(false)
  const [etaSaveError, setEtaSaveError] = useState<string | null>(null)

  // ── Review / Feedback state ──────────────────────────────────────────────
  const [feedbackEntries, setFeedbackEntries] = useState<ProjectFeedback[]>([])
  const [feedbackItems, setFeedbackItems] = useState<ProjectFeedbackItem[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackModalAction, setFeedbackModalAction] = useState<FeedbackActionType>('hold')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  useEffect(() => {
    fetchProjectCountries(project.id).then(setProjectCountries).catch(() => {})
    fetchProjectTasks(project.id).then(setProjectTasks).catch(() => {})
    fetchProjectETAData(project.id).then(d => setEtaData(d)).catch(() => {})
    fetchProjectETAHistory(project.id).then(setEtaHistory).catch(() => {})
    // Load unresolved feedback count for badge
    fetchProjectFeedbackUnresolvedCount(project.id).then(setUnresolvedCount).catch(() => {})
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

  // ── Delivery Notes state ─────────────────────────────────────────────────────
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteComposing, setNoteComposing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteEditingId, setNoteEditingId] = useState<string | null>(null)
  const [noteEditText, setNoteEditText] = useState('')
  const [noteDeletingId, setNoteDeletingId] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const noteEditorRef = useRef<RichTextEditorRef>(null)

  // Completed / Ready to Deliver statuses auto-fill delivered date
  const DELIVERED_STATUSES = ['Completed', 'Ready to Deliver']
  const willMarkDelivered = DELIVERED_STATUSES.includes(selectedStatusName) && !localProject.date_delivered

  useEffect(() => {
    fetchLookups().then(l => setStatuses(l.statuses)).catch(() => {})
  }, [])

  useEffect(() => {
    fetchNotificationSettings().then((settings: any[]) => {
      const map: Record<string, boolean> = {}
      settings.forEach((s: any) => { map[s.setting_key] = s.setting_value })
      setNotifSettings(map)
    }).catch(() => {})
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

  const loadDeliveryNotes = async () => {
    setNotesLoading(true)
    try {
      const notes = await fetchDeliveryNotes(localProject.id)
      setDeliveryNotes(notes)
    } catch (err) {
      console.error('Failed to load delivery notes:', err)
    } finally {
      setNotesLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'files') loadFiles()
    if (tab === 'delivery') { loadDeliveryFiles(); loadDeliveryNotes() }
    if (tab === 'review') {
      setFeedbackLoading(true)
      fetchProjectFeedback(localProject.id).then(({ entries, items }) => {
        setFeedbackEntries(entries)
        setFeedbackItems(items)
        setUnresolvedCount(items.filter(i => !i.is_resolved).length)
      }).catch(() => {}).finally(() => setFeedbackLoading(false))
    }
  }, [tab, localProject.id])

  const handleStatusChange = (statusId: number, statusName: string) => {
    setSelectedStatusId(statusId)
    setSelectedStatusName(statusName)
    setStatusSuccess(false)
    setStatusError(null)
  }

  const handleNotificationToggle = async () => {
    const newVal = !(localProject.notifications_enabled ?? true)
    setNotifToggling(true)
    try {
      await updateProjectNotificationsEnabled(localProject.id, newVal)
      setLocalProject(prev => ({ ...prev, notifications_enabled: newVal }))
    } catch (err) {
      console.error('Failed to toggle notifications:', err)
    } finally {
      setNotifToggling(false)
    }
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
      // ── Fire notification ────────────────────────────────────────────────
      const notifEnabled = updated.notifications_enabled ?? true
      const ownerId = localProject.created_by
      if (notifEnabled && ownerId) {
        const isCompleted = selectedStatusName === 'Completed' || selectedStatusName === 'Ready to Deliver'
        const globalKey = isCompleted ? 'notify_on_completed' : 'notify_on_status_change'
        if (notifSettings[globalKey] !== false) {
          fetchProjectOwnerEmail(ownerId).then(email => {
            if (!email) return
            sendNotification({
              type: isCompleted ? 'completed' : 'status_changed',
              to: email,
              project: updated,
              newStatus: selectedStatusName,
            }).then(() => {
              setNotifSent(true)
              setTimeout(() => setNotifSent(false), 4000)
            })
          }).catch(() => {})
        }
        // In-app notification for status change (non-blocking)
        if (ownerId !== user?.id) {
          createNotification({
            userId: ownerId,
            type: 'status_change',
            title: `Project status updated to ${selectedStatusName}`,
            body: `Your project "${updated.project_owner}" has been updated to ${selectedStatusName}.`,
            projectId: updated.id,
            projectName: updated.project_owner,
          }).catch(() => {})
        }
      }
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

  // ── Delivery Note handlers ────────────────────────────────────────────────────
  const handleNoteCreate = async () => {
    if (isRichTextEmpty(noteText) || !user) return
    setNoteSaving(true)
    setNoteError(null)
    try {
      const created = await createDeliveryNote(localProject.id, noteText, user.id)
      setDeliveryNotes(prev => [created, ...prev])
      setNoteText('')
      setNoteComposing(false)
    } catch (err: any) {
      setNoteError(err.message || 'Failed to save note')
    } finally {
      setNoteSaving(false)
    }
  }

  const handleNoteEditSave = async (noteId: string) => {
    if (isRichTextEmpty(noteEditText) || !user) return
    setNoteSaving(true)
    setNoteError(null)
    try {
      await updateDeliveryNote(noteId, noteEditText, user.id)
      setDeliveryNotes(prev => prev.map(n =>
        n.id === noteId
          ? { ...n, note: noteEditText.trim(), updated_at: new Date().toISOString(), updater_name: 'You' }
          : n
      ))
      setNoteEditingId(null)
      setNoteEditText('')
    } catch (err: any) {
      setNoteError(err.message || 'Failed to update note')
    } finally {
      setNoteSaving(false)
    }
  }

  const handleNoteDelete = async (noteId: string) => {
    if (!window.confirm('Delete this delivery note? This cannot be undone.')) return
    setNoteDeletingId(noteId)
    try {
      await deleteDeliveryNote(noteId)
      setDeliveryNotes(prev => prev.filter(n => n.id !== noteId))
    } catch (err: any) {
      setNoteError(err.message || 'Failed to delete note')
    } finally {
      setNoteDeletingId(null)
    }
  }

  function noteAuthorInitials(name: string | null): string {
    if (!name) return '?'
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
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
      // ── Fire delivery file notification ─────────────────────────────────
      const notifEnabled = localProject.notifications_enabled ?? true
      const ownerId = localProject.created_by
      if (notifEnabled && ownerId && notifSettings['notify_on_delivery_file_upload'] !== false) {
        fetchProjectOwnerEmail(ownerId).then(email => {
          if (!email) return
          sendNotification({
            type: 'delivery_file',
            to: email,
            project: localProject,
            files: [{ file_name: newFile.file_name, file_size: newFile.file_size, description: newFile.description || undefined }],
          })
        }).catch(() => {})
      }
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

  // ── AI ETA save handler (admin only) ─────────────────────────────────────
  const handleEtaSave = async () => {
    if (!etaNewDays || !user) return
    const newDays = parseInt(etaNewDays)
    if (isNaN(newDays) || newDays < 1) return
    setEtaSaving(true)
    setEtaSaveError(null)
    try {
      const oldDays = etaData?.ai_eta_override_days ?? etaData?.ai_eta_days ?? null
      await updateProjectETA(localProject.id, newDays, etaReason || null, user.id, oldDays, etaNotify)
      if (etaNotify && localProject.created_by) {
        const ownerEmail = await fetchProjectOwnerEmail(localProject.created_by)
        if (ownerEmail) {
          sendNotification({
            type: 'eta_changed',
            to: ownerEmail,
            project: localProject,
            oldDays,
            newDays,
            reason: etaReason || null,
          }).catch(() => {})
        }
      }
      setEtaData(prev => ({
        ai_eta_days: prev?.ai_eta_days ?? null,
        ai_eta_confidence: prev?.ai_eta_confidence ?? null,
        ai_eta_breakdown: prev?.ai_eta_breakdown ?? null,
        ai_eta_override_days: newDays,
        ai_eta_override_by: user.id,
        ai_eta_override_at: new Date().toISOString(),
        ai_eta_override_reason: etaReason || null,
      }))
      setEtaHistory(prev => [{
        id: `local-${Date.now()}`,
        project_id: localProject.id,
        changed_by: user.id,
        changed_at: new Date().toISOString(),
        old_days: oldDays,
        new_days: newDays,
        reason: etaReason || null,
        notified_requester: etaNotify,
        changed_by_name: 'You',
      }, ...prev])
      setEtaEditing(false)
    } catch (err: any) {
      setEtaSaveError(err.message || 'Failed to save ETA change')
    } finally {
      setEtaSaving(false)
    }
  }



  // ── Resizable panel ────────────────────────────────────────────────────────
  const MIN_WIDTH = 420
  const getMaxWidth = () => Math.floor(window.innerWidth * 0.45)
  const [panelWidth, setPanelWidth] = React.useState<number>(() => {
    const stored = localStorage.getItem('detailPanelWidth')
    if (stored) {
      const n = parseInt(stored, 10)
      if (!isNaN(n) && n >= MIN_WIDTH) return n
    }
    return MIN_WIDTH
  })
  const isResizing = React.useRef(false)
  const startX = React.useRef(0)
  const startWidth = React.useRef(0)

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = panelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const delta = startX.current - ev.clientX
      const newWidth = Math.min(Math.max(startWidth.current + delta, MIN_WIDTH), getMaxWidth())
      setPanelWidth(newWidth)
    }
    const onMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPanelWidth(prev => {
        localStorage.setItem('detailPanelWidth', String(prev))
        return prev
      })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-y-0 right-0 bg-base-100 border-l border-base-300 shadow-2xl z-50 flex flex-col" style={{ width: panelWidth }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 group"
        title="Drag to resize"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 h-8 w-0.5 rounded-full bg-base-content/20 group-hover:bg-primary/60 transition-colors" />
      </div>
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
          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm btn-circle text-error/60 hover:text-error hover:bg-error/10"
              title="Delete project"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 size={14} />
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
        <button
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors relative ${tab === 'review' ? 'border-b-2 border-primary text-primary' : 'text-base-content/50 hover:text-base-content'}`}
          onClick={() => setTab('review')}
        >
          <ShieldAlert size={13} />
          Review
          {unresolvedCount > 0 && (
            <span className="badge badge-xs badge-error ml-0.5">{unresolvedCount}</span>
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
              {/* Per-project notification toggle — admin only */}
              <div className="mt-3 pt-3 border-t border-base-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(localProject.notifications_enabled ?? true)
                      ? <Bell size={13} className="text-success" />
                      : <BellOff size={13} className="text-base-content/30" />
                    }
                    <div>
                      <div className="text-xs font-medium text-base-content">Email Notifications</div>
                      <div className="text-xs text-base-content/40">
                        {(localProject.notifications_enabled ?? true)
                          ? 'Requestor gets notified on updates'
                          : 'Notifications disabled for this project'
                        }
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-success"
                    checked={localProject.notifications_enabled ?? true}
                    onChange={handleNotificationToggle}
                    disabled={notifToggling}
                  />
                </div>
                {notifSent && (
                  <div className="mt-2 text-xs text-info flex items-center gap-1.5">
                    <Bell size={11} />
                    Notification sent to requestor
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action required banner for non-admin users */}
          {!isAdmin && unresolvedCount > 0 && (
            <div
              className="mx-4 mt-3 flex items-center gap-3 p-3 bg-warning/10 rounded-xl border border-warning/30 cursor-pointer hover:bg-warning/15 transition-colors"
              onClick={() => setTab('review')}
            >
              <AlertCircle size={15} className="text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-base-content">Action Required</p>
                <p className="text-xs text-base-content/60 mt-0.5">
                  {unresolvedCount} item{unresolvedCount !== 1 ? 's' : ''} need{unresolvedCount === 1 ? 's' : ''} your attention — click to view feedback
                </p>
              </div>
              <span className="text-xs text-warning/70 font-medium shrink-0">View →</span>
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

            {/* ── Visual progress timeline ─────────────────────────────────── */}
            {(() => {
              const toDay = (s: string | null | undefined) => {
                if (!s) return null
                const d = new Date(s + 'T00:00:00')
                return isNaN(d.getTime()) ? null : d
              }
              const received  = toDay(localProject.date_received)
              const due       = toDay(localProject.expected_delivery_date)
              const delivered = toDay(localProject.date_delivered)
              const today     = new Date(); today.setHours(0,0,0,0)
              if (!received || !due) return null

              // Build span: from received to slightly past the latest milestone
              const candidates = [due, delivered ?? today, today]
              const maxMs = Math.max(...candidates.map(d => d.getTime()))
              const spanMs = maxMs - received.getTime()
              const endMs  = received.getTime() + spanMs * 1.10 // 10% right buffer

              const pct = (d: Date) =>
                Math.max(0, Math.min(99, (d.getTime() - received.getTime()) / (endMs - received.getTime()) * 100))

              const duePct       = pct(due)
              const todayPct     = pct(today)
              const deliveredPct = delivered ? pct(delivered) : null

              const isCompleted = delivered != null
              const isLate      = delivered ? delivered > due : today > due
              const fillPct     = deliveredPct ?? Math.min(todayPct, 99)
              const fillColor   = isCompleted
                ? (isLate ? 'bg-error/60' : 'bg-success/60')
                : (isLate ? 'bg-error/40' : 'bg-info/50')

              // Days early/late from date arithmetic
              const MS_PER_DAY = 86400000
              const diffDays = delivered
                ? Math.round((due.getTime() - delivered.getTime()) / MS_PER_DAY)
                : Math.round((due.getTime() - today.getTime()) / MS_PER_DAY)

              return (
                <div className="my-3 px-0.5">
                  {/* Rail */}
                  <div className="relative h-1.5 bg-base-300 rounded-full">
                    {/* Progress fill */}
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${fillColor}`}
                      style={{ width: `${fillPct}%` }}
                    />
                    {/* Start dot */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-base-content/30 ring-2 ring-base-100"
                         style={{ left: '-4px' }} />
                    {/* Due date marker — amber vertical stripe */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-warning/80"
                      style={{ left: `${duePct}%` }}
                      title={`Due: ${formatDate(localProject.expected_delivery_date)}`}
                    />
                    {/* Today marker — primary line (only while in progress) */}
                    {!isCompleted && todayPct < 99 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-primary"
                        style={{ left: `${todayPct}%` }}
                        title="Today"
                      />
                    )}
                    {/* Delivered dot — green/red based on lateness */}
                    {deliveredPct != null && (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-base-100 ${isLate ? 'bg-error' : 'bg-success'}`}
                        style={{ left: `calc(${deliveredPct}% - 5px)` }}
                        title={`Delivered: ${formatDate(localProject.date_delivered)}`}
                      />
                    )}
                  </div>

                  {/* Labels row */}
                  <div className="flex items-start justify-between mt-2">
                    <span className="text-[10px] text-base-content/40 font-medium leading-tight">
                      {formatDate(localProject.date_received)}
                    </span>
                    <span className="text-[10px] text-warning/80 font-semibold leading-tight text-right">
                      Due {formatDate(localProject.expected_delivery_date)}
                    </span>
                  </div>

                  {/* Status pill */}
                  <div className="mt-2 flex justify-center">
                    {isCompleted ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isLate
                          ? 'bg-error/10 text-error'
                          : 'bg-success/10 text-success'
                      }`}>
                        {isLate
                          ? `${Math.abs(diffDays)}d late`
                          : diffDays === 0 ? 'On time' : `${diffDays}d early`}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isLate
                          ? 'bg-error/10 text-error'
                          : 'bg-info/10 text-info'
                      }`}>
                        {isLate ? 'Overdue' : `${diffDays}d remaining`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}
            {/* ──────────────────────────────────────────────────────────────── */}

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

            {/* ── AI Delivery Estimate Box ──────────────────────────────── */}
            <>
              <div className="divider my-1"></div>
              <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 pt-2 pb-1 flex items-center gap-1.5">
                <Zap size={12} />
                AI Delivery Estimate
              </div>
              <div className="rounded-xl border border-base-300 bg-base-200 p-3 mt-1">
                {/* Original AI estimate */}
                {etaData?.ai_eta_days != null && (
                  <div className="mb-2 pb-2 border-b border-base-300">
                    <div className="text-xs text-base-content/45 mb-1">Original AI Estimate</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">~{etaData.ai_eta_days} business days</span>
                      {etaData.ai_eta_confidence && (
                        <span className={`badge badge-xs ${etaData.ai_eta_confidence === 'High' ? 'badge-success' : etaData.ai_eta_confidence === 'Medium' ? 'badge-warning' : 'badge-info'}`}>
                          {etaData.ai_eta_confidence}
                        </span>
                      )}
                    </div>
                    {etaData.ai_eta_breakdown && (
                      <p className="text-xs text-base-content/35 mt-0.5 leading-relaxed">{etaData.ai_eta_breakdown}</p>
                    )}
                  </div>
                )}
                {/* Current effective ETA or no-data placeholder */}
                {(etaData?.ai_eta_days != null || etaData?.ai_eta_override_days != null) ? (
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="text-xs text-base-content/45 mb-1">
                        {etaData?.ai_eta_override_days != null ? 'Current (Admin Override)' : 'Current Estimate'}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">
                          ~{etaData?.ai_eta_override_days ?? etaData?.ai_eta_days} business days
                        </span>
                        {etaData?.ai_eta_override_days != null && (
                          <span className="badge badge-xs badge-warning">Override</span>
                        )}
                      </div>
                      {etaData?.ai_eta_override_reason && (
                        <p className="text-xs text-base-content/50 mt-0.5 italic">"{etaData.ai_eta_override_reason}"</p>
                      )}
                      {etaData?.ai_eta_override_at && (
                        <p className="text-xs text-base-content/35 mt-0.5">
                          by {etaHistory[0]?.changed_by_name || 'Admin'} · {timeAgo(etaData.ai_eta_override_at)}
                        </p>
                      )}
                    </div>
                    {isAdmin && !etaEditing && (
                      <button
                        className="btn btn-ghost btn-xs btn-circle shrink-0 mt-0.5"
                        title="Edit ETA"
                        onClick={() => {
                          setEtaEditing(true)
                          setEtaNewDays(String(etaData?.ai_eta_override_days ?? etaData?.ai_eta_days ?? ''))
                          setEtaReason('')
                          setEtaNotify(false)
                          setEtaSaveError(null)
                        }}
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-base-content/40 flex-1">No AI estimate available for this project</span>
                    {isAdmin && !etaEditing && (
                      <button
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={() => { setEtaEditing(true); setEtaNewDays(''); setEtaReason(''); setEtaNotify(false); setEtaSaveError(null) }}
                      >
                        <Plus size={11} /> Add
                      </button>
                    )}
                  </div>
                )}
                {/* Admin edit form */}
                {isAdmin && etaEditing && (
                  <div className={`space-y-2 ${(etaData?.ai_eta_days != null || etaData?.ai_eta_override_days != null) ? 'border-t border-base-300 mt-3 pt-3' : 'mt-2'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-base-content/60 shrink-0">New estimate:</label>
                      <input
                        type="number"
                        min="1"
                        className="input input-bordered input-xs w-20"
                        value={etaNewDays}
                        onChange={e => setEtaNewDays(e.target.value)}
                        placeholder="Days"
                        autoFocus
                      />
                      <span className="text-xs text-base-content/50">business days</span>
                    </div>
                    <input
                      className="input input-bordered input-xs w-full"
                      placeholder="Reason for change (optional)"
                      value={etaReason}
                      onChange={e => setEtaReason(e.target.value)}
                    />
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={etaNotify}
                        onChange={e => setEtaNotify(e.target.checked)}
                      />
                      <span className="text-xs">Notify requester via email</span>
                    </label>
                    {etaSaveError && (
                      <p className="text-xs text-error">{etaSaveError}</p>
                    )}
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => { setEtaEditing(false); setEtaSaveError(null) }}
                        disabled={etaSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className={`btn btn-primary btn-xs gap-1 ${etaSaving ? 'loading' : ''}`}
                        onClick={handleEtaSave}
                        disabled={!etaNewDays || etaSaving}
                      >
                        {!etaSaving && <CheckCircle2 size={11} />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* ETA override history */}
              {etaHistory.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs text-base-content/35 flex items-center gap-1 mb-1">
                    <History size={11} />
                    Override history
                  </div>
                  {etaHistory.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs p-2 bg-base-100 rounded-lg border border-base-200">
                      <span className="text-base-content/35 shrink-0 tabular-nums">{timeAgo(h.changed_at)}</span>
                      <span className="flex-1 text-base-content/60">
                        <span className="font-medium text-base-content/80">{h.changed_by_name || 'Admin'}</span>
                        {': '}
                        {h.old_days ? `${h.old_days}d → ` : ''}
                        <span className="font-medium">{h.new_days}d</span>
                        {h.reason && <span className="text-base-content/40 italic"> · "{h.reason}"</span>}
                        {h.notified_requester && <span className="ml-1 text-info/70"> · notified</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
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
                const who = entry.user_name || (entry.user_id ? `User …${entry.user_id.slice(-6)}` : 'System')
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

          {/* ── Delivery Notes Section ─────────────────────────────────────── */}
          <div className="border-b border-base-300">
            {/* Notes header */}
            <div className="flex items-center justify-between px-4 py-3 bg-base-50">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-primary/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
                  Delivery Notes
                </span>
                {deliveryNotes.length > 0 && (
                  <span className="badge badge-primary badge-xs">{deliveryNotes.length}</span>
                )}
              </div>
              {isAdmin && !noteComposing && (
                <button
                  className="btn btn-xs btn-ghost gap-1 text-primary"
                  onClick={() => { setNoteComposing(true); setNoteError(null) }}
                >
                  <Plus size={12} /> Add Note
                </button>
              )}
            </div>

            {/* Compose form */}
            {isAdmin && noteComposing && (
              <div className="px-4 pb-4 pt-2 bg-base-50 space-y-2">
                <TextPresets onInsert={(text) => noteEditorRef.current?.insertContent(text)} />
                <RichTextEditor
                  ref={noteEditorRef}
                  content={noteText}
                  onChange={setNoteText}
                  placeholder="Enter delivery notes for the requestor — describe the data delivered, methodology, coverage, caveats, etc."
                  minHeight={140}
                  autoFocus
                />
                {noteError && (
                  <div className="flex items-center gap-1.5 text-xs text-error">
                    <AlertCircle size={12} /> {noteError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => { setNoteComposing(false); setNoteText(''); setNoteError(null) }}
                    disabled={noteSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className={`btn btn-xs btn-primary gap-1 ${noteSaving ? 'loading' : ''}`}
                    onClick={handleNoteCreate}
                    disabled={isRichTextEmpty(noteText) || noteSaving}
                  >
                    {!noteSaving && <Send size={11} />}
                    Post Note
                  </button>
                </div>
              </div>
            )}

            {/* Notes list */}
            <div className="max-h-72 overflow-y-auto">
              {notesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-primary/50" />
                </div>
              ) : deliveryNotes.length === 0 ? (
                <div className="text-center py-6">
                  <MessageSquare size={24} className="mx-auto text-base-content/15 mb-1.5" />
                  <p className="text-xs text-base-content/30">
                    {isAdmin ? 'No delivery notes yet — add context for the requestor' : 'No analyst notes for this delivery yet'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-base-200">
                  {deliveryNotes.map(n => (
                    <div key={n.id} className="group relative">
                      {/* Edit mode */}
                      {isAdmin && noteEditingId === n.id ? (
                        <div className="p-4 space-y-2 bg-base-100">
                          <RichTextEditor
                            content={noteEditText}
                            onChange={setNoteEditText}
                            minHeight={120}
                            autoFocus
                          />
                          {noteError && (
                            <div className="flex items-center gap-1.5 text-xs text-error">
                              <AlertCircle size={12} /> {noteError}
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => { setNoteEditingId(null); setNoteEditText(''); setNoteError(null) }}
                              disabled={noteSaving}
                            >
                              Cancel
                            </button>
                            <button
                              className={`btn btn-xs btn-primary gap-1 ${noteSaving ? 'loading' : ''}`}
                              onClick={() => handleNoteEditSave(n.id)}
                              disabled={isRichTextEmpty(noteEditText) || noteSaving}
                            >
                              {!noteSaving && <CheckCircle2 size={11} />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read mode */
                        <div className="flex gap-3 p-4 hover:bg-base-50 transition-colors">
                          {/* Left accent stripe */}
                          <div className="shrink-0 w-0.5 rounded-full bg-primary/30 self-stretch" />

                          {/* Avatar */}
                          <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary/70 leading-none">
                              {noteAuthorInitials(n.author_name)}
                            </span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Author row */}
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-sm font-semibold text-base-content">
                                {n.author_name || 'Unknown'}
                              </span>
                              {n.author_role === 'admin' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20">
                                  Admin
                                </span>
                              )}
                              <span className="text-xs text-base-content/35 ml-auto" title={new Date(n.created_at).toLocaleString()}>
                                {timeAgo(n.created_at)}
                              </span>
                              {n.updated_at && (
                                <span className="text-[10px] text-base-content/30 italic">edited</span>
                              )}
                            </div>

                            {/* Note body */}
                            <div
                              className="prose prose-sm max-w-none text-sm text-base-content/80 leading-relaxed
                                [&_p:empty]:min-h-[1em]
                                [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                                [&_li]:my-0.5 [&_hr]:border-base-300 [&_hr]:my-2
                                [&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_u]:underline"
                              dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(n.note) }}
                            />

                            {/* Updater line */}
                            {n.updated_at && n.updater_name && (
                              <p className="text-[10px] text-base-content/30 mt-1.5">
                                Last edited by {n.updater_name} · {timeAgo(n.updated_at)}
                              </p>
                            )}
                          </div>

                          {/* Admin actions (hover) */}
                          {isAdmin && (
                            <div className="shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="btn btn-ghost btn-xs btn-circle tooltip tooltip-left"
                                data-tip="Edit note"
                                onClick={() => { setNoteEditingId(n.id); setNoteEditText(n.note); setNoteError(null) }}
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error hover:bg-error/10 tooltip tooltip-left"
                                data-tip="Delete note"
                                onClick={() => handleNoteDelete(n.id)}
                                disabled={noteDeletingId === n.id}
                              >
                                {noteDeletingId === n.id
                                  ? <Loader2 size={12} className="animate-spin" />
                                  : <Trash2 size={12} />
                                }
                              </button>
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
                            {(() => { const exp = getExpiryBadge(f.expires_at); return exp ? <><span>·</span><span className={exp.cls} title={exp.title}>{exp.label}</span></> : null })()}
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

      {/* Review Tab */}
      {tab === 'review' && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Admin action buttons */}
          {isAdmin && (
            <div className="p-4 border-b border-base-300 bg-base-50">
              <div className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-3">Admin Actions</div>
              <div className="flex flex-col gap-2">
                <button
                  className="btn btn-warning btn-sm gap-2 w-full justify-start"
                  onClick={() => { setFeedbackModalAction('hold'); setShowFeedbackModal(true) }}
                >
                  <Clock size={14} /> Put On Hold
                </button>
                <button
                  className="btn btn-info btn-sm gap-2 w-full justify-start"
                  onClick={() => { setFeedbackModalAction('request_changes'); setShowFeedbackModal(true) }}
                >
                  <MessageSquare size={14} /> Request Changes
                </button>
                <button
                  className="btn btn-error btn-sm btn-outline gap-2 w-full justify-start"
                  onClick={() => { setFeedbackModalAction('reject'); setShowFeedbackModal(true) }}
                >
                  <XCircle size={14} /> Reject Project
                </button>
                {localProject.status === 'On Hold' && (
                  <button
                    className="btn btn-success btn-sm btn-outline gap-2 w-full justify-start"
                    onClick={async () => {
                      if (!user) return
                      setFeedbackSubmitting(true)
                      try {
                        const authorName = (user as any)?.user_metadata?.full_name || user.email || 'Admin'
                        const approvalMessage = 'Your project has been approved and will move forward.'
                        // createProjectFeedback auto-fires in-app notification to requester
                        const entry = await createProjectFeedback({
                          projectId: localProject.id,
                          authorId: user.id,
                          authorName,
                          authorRole: 'admin',
                          actionType: 'approve',
                          message: approvalMessage,
                          statusChangeToId: 1,
                          statusChangeToName: 'In Process',
                          notifyRequester: true,
                          items: [],
                        })
                        const updated = { ...localProject, status: 'In Process', status_id: 1 }
                        setLocalProject(updated)
                        setSelectedStatusId(1)
                        setSelectedStatusName('In Process')
                        onStatusUpdated?.(updated)
                        setFeedbackEntries(prev => [...prev, entry])
                        // Send email to requester (approval always notifies)
                        if (localProject.created_by) {
                          fetchProjectOwnerEmail(localProject.created_by).then(email => {
                            if (!email) return
                            sendNotification({
                              type: 'project_feedback',
                              to: email,
                              project: localProject,
                              actionType: 'approve',
                              message: approvalMessage,
                              items: [],
                              adminName: authorName,
                            } as any).catch(() => {})
                          }).catch(() => {})
                        }
                      } catch (err: any) {
                        alert('Failed to approve: ' + (err.message || 'Unknown error'))
                      } finally {
                        setFeedbackSubmitting(false)
                      }
                    }}
                    disabled={feedbackSubmitting}
                  >
                    <CheckCircle2 size={14} /> Approve & Resume
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Thread */}
          <div className="flex-1 overflow-y-auto">
            <FeedbackThread
              entries={feedbackEntries}
              items={feedbackItems}
              isAdmin={isAdmin}
              currentUserId={user?.id || ''}
              currentUserName={(user as any)?.user_metadata?.full_name || user?.email || ''}
              projectOwnerId={localProject.created_by || null}
              loading={feedbackLoading}
              onItemResolve={async (item, note) => {
                if (!user) return
                const name = (user as any)?.user_metadata?.full_name || user.email || 'User'
                await resolveProjectFeedbackItem(item.id, note, user.id, name)
                setFeedbackItems(prev => prev.map(i => i.id === item.id
                  ? { ...i, is_resolved: true, resolved_by: user.id, resolved_by_name: name, resolved_at: new Date().toISOString(), resolution_note: note }
                  : i
                ))
                setUnresolvedCount(prev => Math.max(0, prev - 1))
                // Notify: user resolves → admins; admin resolves → requester
                if (!isAdmin) {
                  createNotificationsForAdmins({
                    type: 'checklist_resolved',
                    title: 'Checklist item resolved',
                    body: `${name} resolved a checklist item on "${localProject.project_owner || localProject.client_name || 'a project'}".`,
                    projectId: localProject.id,
                    projectName: localProject.project_owner,
                    excludeUserId: user.id,
                  }).catch(() => {})
                } else if (localProject.created_by && localProject.created_by !== user.id) {
                  createNotification({
                    userId: localProject.created_by,
                    type: 'checklist_resolved',
                    title: 'Checklist item resolved',
                    body: `${name} resolved a checklist item on your project "${localProject.project_owner || localProject.client_name || ''}".`,
                    projectId: localProject.id,
                    projectName: localProject.project_owner,
                  }).catch(() => {})
                }
              }}
              onItemUnresolve={async (item) => {
                await unresolveProjectFeedbackItem(item.id)
                setFeedbackItems(prev => prev.map(i => i.id === item.id
                  ? { ...i, is_resolved: false, resolved_by: null, resolved_by_name: null, resolved_at: null, resolution_note: null }
                  : i
                ))
                setUnresolvedCount(prev => prev + 1)
              }}
              onAddResponse={async (message) => {
                if (!user) return
                const name = (user as any)?.user_metadata?.full_name || user.email || 'User'
                const entry = await submitProjectResponse(localProject.id, message, user.id, name)
                setFeedbackEntries(prev => [...prev, entry])
              }}
              onResubmit={async () => {
                if (!user) return
                const name = (user as any)?.user_metadata?.full_name || user.email || 'User'
                await submitForReReview(localProject.id, user.id, name)
                const resubmitEntry: ProjectFeedback = {
                  id: `local-${Date.now()}`,
                  project_id: localProject.id,
                  author_id: user.id,
                  author_name: name,
                  author_role: 'user',
                  action_type: 'resubmit',
                  message: 'Project submitted for re-review.',
                  status_change_to_id: null,
                  status_change_to_name: null,
                  notify_requester: false,
                  created_at: new Date().toISOString(),
                }
                setFeedbackEntries(prev => [...prev, resubmitEntry])
                // Status stays On Hold — admin must press Approve & Resume
              }}
            />
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <DeleteProjectModal
          projectName={localProject.client_name || 'this project'}
          onConfirm={async () => {
            await deleteProject(localProject.id)
            setShowDeleteModal(false)
            onDelete?.()
            onClose()
          }}
          onClose={() => setShowDeleteModal(false)}
        />
      )}

      {showFeedbackModal && (
        <ProjectFeedbackModal
          projectName={localProject.client_name || 'this project'}
          currentStatus={localProject.status}
          initialAction={feedbackModalAction}
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={async (params) => {
            if (!user) return
            const authorName = (user as any)?.user_metadata?.full_name || user.email || 'Admin'
            await createProjectFeedback({
              projectId: localProject.id,
              authorId: user.id,
              authorName,
              authorRole: 'admin',
              actionType: params.actionType,
              message: params.message,
              statusChangeToId: params.statusChangeToId,
              statusChangeToName: params.statusChangeToName,
              notifyRequester: params.notifyRequester,
              items: params.items,
            })
            // Update local project status if changed
            if (params.statusChangeToId && params.statusChangeToName) {
              const updated = { ...localProject, status: params.statusChangeToName, status_id: params.statusChangeToId }
              setLocalProject(updated)
              setSelectedStatusId(params.statusChangeToId)
              setSelectedStatusName(params.statusChangeToName)
              onStatusUpdated?.(updated)
            }
            // Reload feedback thread
            const { entries, items: newItems } = await fetchProjectFeedback(localProject.id)
            setFeedbackEntries(entries)
            setFeedbackItems(newItems)
            const unresolved = newItems.filter(i => !i.is_resolved).length
            setUnresolvedCount(unresolved)
            setShowFeedbackModal(false)
            setTab('review')
            // Notify requester via email if checked
            if (params.notifyRequester && localProject.created_by) {
              fetchProjectOwnerEmail(localProject.created_by).then(email => {
                if (!email) return
                sendNotification({
                  type: 'project_feedback',
                  to: email,
                  project: localProject,
                  actionType: params.actionType,
                  message: params.message,
                  items: params.items,
                  adminName: authorName,
                } as any).catch(() => {})
              }).catch(() => {})
            }
          }}
        />
      )}
    </div>
  )
}
