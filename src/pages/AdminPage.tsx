import React, { useState, useEffect, useRef } from 'react'
import BulkUserPage from './BulkUserPage'
import {
  UserPlus, Shield, User, CheckCircle2, Edit2, Save, X, AlertCircle,
  Loader2, RefreshCw, Key, Users, Plus, Trash2, Tag, Layers, Upload, Download,
  Search, ChevronLeft, ChevronRight, UserX, UserCheck, Bell, Mail, Image,
} from 'lucide-react'
import { supabase, getAuthHeaders } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchAnalysts, createAnalyst, updateAnalyst, deactivateAnalyst,
  fetchClientTypesAdmin, createClientType, updateClientType, deactivateClientType,
  fetchProjectTypes, createProjectType, updateProjectType, deactivateProjectType,
  fetchNotificationSettings, updateNotificationSetting,
  fetchAppSettings, updateAppSetting,
  fetchAllClients, createClient, updateClient, deactivateClient, importClients,
  fetchClientRequests, approveClientRequest, rejectClientRequest,
} from '../lib/data'
import type { Analyst, ClientType, ProjectType, Client, ClientRequest } from '../lib/data'
import type { UserProfile } from '../types'

// ─── Reusable inline-editable list section ────────────────────────────────────

interface ListItem { id: number; name: string }

interface ManagedListProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  items: ListItem[]
  loading: boolean
  error: string | null
  onClearError: () => void
  onAdd: (name: string, file?: File) => Promise<void>
  onEdit: (id: number, name: string, file?: File) => Promise<void>
  onRemove: (item: ListItem) => Promise<void>
  withTemplateUpload?: boolean
  templateItems?: ProjectType[]
}

const ManagedList: React.FC<ManagedListProps> = ({
  title, subtitle, icon, items, loading, error, onClearError,
  onAdd, onEdit, onRemove, withTemplateUpload = false, templateItems = [],
}) => {
  const [newName, setNewName] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const addFileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await onAdd(newName, newFile || undefined)
      setNewName('')
      setNewFile(null)
      if (addFileRef.current) addFileRef.current.value = ''
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (item: ListItem) => {
    setEditId(item.id)
    setEditName(item.name)
    setEditFile(null)
    if (editFileRef.current) editFileRef.current.value = ''
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditName('')
    setEditFile(null)
  }

  const handleSaveEdit = async () => {
    if (!editName.trim() || editId === null) return
    setSaving(true)
    try {
      await onEdit(editId, editName, editFile || undefined)
      setEditId(null)
      setEditName('')
      setEditFile(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between mb-2">
          <h3 className="card-title text-base flex items-center gap-2">
            {icon} {title}
          </h3>
          <span className="text-xs text-base-content/50">{items.length} active</span>
        </div>
        <p className="text-xs text-base-content/50 mb-3">{subtitle}</p>

        {error && (
          <div className="alert alert-error py-2 mb-3">
            <AlertCircle size={14} />
            <span className="text-sm">{error}</span>
            <button className="btn btn-ghost btn-xs ml-auto" onClick={onClearError}><X size={11} /></button>
          </div>
        )}

        {/* Add form */}
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4">
          <input
            className="input input-bordered input-sm flex-1 min-w-40"
            placeholder={`${title} name…`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          {withTemplateUpload && (
            <label className="btn btn-ghost btn-sm gap-1.5 border border-base-300 cursor-pointer">
              <Upload size={13} />
              {newFile ? <span className="max-w-24 truncate text-xs">{newFile.name}</span> : <span className="text-xs">Template (optional)</span>}
              <input
                ref={addFileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={e => setNewFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
          <button
            type="submit"
            className={`btn btn-primary btn-sm gap-1.5 ${adding ? 'loading' : ''}`}
            disabled={adding || !newName.trim()}
          >
            {!adding && <Plus size={14} />} Add
          </button>
        </form>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-base-content/40 text-center py-4">No items yet — add one above.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map(item => {
              const pt = templateItems.find(t => t.id === item.id)
              return editId === item.id ? (
                <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2 bg-base-100 border border-primary/30 rounded-lg">
                  <input
                    className="input input-bordered input-xs flex-1 min-w-32"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') cancelEdit() }}
                  />
                  {withTemplateUpload && (
                    <label className="btn btn-ghost btn-xs gap-1 border border-base-300 cursor-pointer">
                      <Upload size={11} />
                      {editFile ? <span className="max-w-20 truncate text-xs">{editFile.name}</span> : <span className="text-xs">Replace template</span>}
                      <input
                        ref={editFileRef}
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={e => setEditFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                  <button
                    className={`btn btn-success btn-xs gap-1 ${saving ? 'loading' : ''}`}
                    onClick={handleSaveEdit}
                    disabled={saving || !editName.trim()}
                  >
                    {!saving && <Save size={11} />} Save
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={cancelEdit}><X size={11} /></button>
                </div>
              ) : (
                <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-base-100 border border-base-300 rounded-lg group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{item.name}</span>
                    {pt?.template_url && (
                      <a
                        href={pt.template_url}
                        download={pt.template_label || pt.name}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-xs gap-1 text-primary/70 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Download template"
                      >
                        <Download size={11} /> Template
                      </a>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="btn btn-ghost btn-xs gap-1 hover:bg-primary/10"
                      onClick={() => startEdit(item)}
                      title="Edit"
                    >
                      <Edit2 size={11} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error/60 hover:text-error hover:bg-error/10"
                      onClick={() => onRemove(item)}
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

export const AdminPage: React.FC = () => {
  const { isSuperAdmin } = useAuth()
  const [showBulkUsers, setShowBulkUsers] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ email: '', full_name: '', password: '', role: 'user' as 'admin' | 'user' | 'super_admin' })
  const [editForm, setEditForm] = useState({ full_name: '', role: 'user' as 'admin' | 'user' | 'super_admin', is_active: true })

  // ── List states ───────────────────────────────────────────────────────────
  const [analysts, setAnalysts] = useState<Analyst[]>([])
  const [analystLoading, setAnalystLoading] = useState(false)
  const [analystError, setAnalystError] = useState<string | null>(null)

  const [clientTypes, setClientTypes] = useState<ClientType[]>([])
  const [ctLoading, setCtLoading] = useState(false)
  const [ctError, setCtError] = useState<string | null>(null)

  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [ptLoading, setPtLoading] = useState(false)
  const [ptError, setPtError] = useState<string | null>(null)

  // Clients
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientSearch, setClientSearch] = useState('')
  const [clientPage, setClientPage] = useState(0)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [clientRequests, setClientRequests] = useState<ClientRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [clientCsvFile, setClientCsvFile] = useState<File | null>(null)
  const [clientCsvImporting, setClientCsvImporting] = useState(false)
  const [clientCsvResult, setClientCsvResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const [clientCsvError, setClientCsvError] = useState<string | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientExtId, setNewClientExtId] = useState('')
  const [addingClient, setAddingClient] = useState(false)
  const [editClientId, setEditClientId] = useState<number | null>(null)
  const [editClientName, setEditClientName] = useState('')
  const [editClientExtId, setEditClientExtId] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [reassignRequestId, setReassignRequestId] = useState<number | null>(null)
  const [reassignClientId, setReassignClientId] = useState<string>('')
  const clientCsvRef = useRef<HTMLInputElement>(null)

  // Branding state
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [logoSuccess, setLogoSuccess] = useState('')
  const logoFileRef = useRef<HTMLInputElement>(null)

  // Login icon state
  const [currentLoginIconUrl, setCurrentLoginIconUrl] = useState<string | null>(null)
  const [loginIconUploading, setLoginIconUploading] = useState(false)
  const [loginIconError, setLoginIconError] = useState('')
  const [loginIconSuccess, setLoginIconSuccess] = useState('')
  const loginIconFileRef = useRef<HTMLInputElement>(null)

  // Notification settings state
  const [notifSettings, setNotifSettings] = useState<any[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaving, setNotifSaving] = useState<string | null>(null)

  // SSO settings state
  const [ssoEnabledState, setSsoEnabledState] = useState(false)
  const [ssoDomainState, setSsoDomainState] = useState('')
  const [ssoSaving, setSsoSaving] = useState(false)
  const [ssoError, setSsoError] = useState('')
  const [ssoSuccess, setSsoSuccess] = useState('')

  // User management state
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [userPage, setUserPage] = useState(1)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [bulkDeactivating, setBulkDeactivating] = useState(false)
  const [sendingWelcomeFor, setSendingWelcomeFor] = useState<string | null>(null)
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserProfile | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)
  const USERS_PER_PAGE = 25

  const uploadLogo = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('File must be under 2MB')
      return
    }
    setLogoUploading(true)
    setLogoError('')
    setLogoSuccess('')
    try {
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload('logo.png', file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const newUrl = `https://slgtojndmckisjdplhcs.supabase.co/storage/v1/object/public/branding/logo.png?v=${Date.now()}`
      await updateAppSetting('logo_url', newUrl)
      setCurrentLogoUrl(newUrl)
      setLogoSuccess('Logo updated successfully!')
    } catch (err: any) {
      setLogoError(err.message ?? 'Upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = async () => {
    setLogoError('')
    setLogoSuccess('')
    try {
      await updateAppSetting('logo_url', '')
      setCurrentLogoUrl(null)
      setLogoSuccess('Logo removed.')
    } catch (err: any) {
      setLogoError(err.message ?? 'Failed to remove logo')
    }
  }

  const uploadLoginIcon = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setLoginIconError('File must be under 2MB')
      return
    }
    setLoginIconUploading(true)
    setLoginIconError('')
    setLoginIconSuccess('')
    try {
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload('login_icon.png', file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const newUrl = `https://slgtojndmckisjdplhcs.supabase.co/storage/v1/object/public/branding/login_icon.png?v=${Date.now()}`
      await updateAppSetting('login_icon_url', newUrl)
      setCurrentLoginIconUrl(newUrl)
      setLoginIconSuccess('Login icon updated!')
    } catch (err: any) {
      setLoginIconError(err.message ?? 'Upload failed')
    } finally {
      setLoginIconUploading(false)
    }
  }

  const removeLoginIcon = async () => {
    setLoginIconError('')
    setLoginIconSuccess('')
    try {
      await updateAppSetting('login_icon_url', '')
      setCurrentLoginIconUrl(null)
      setLoginIconSuccess('Login icon removed.')
    } catch (err: any) {
      setLoginIconError(err.message ?? 'Failed to remove login icon')
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (!error) setUsers(data as UserProfile[])
    setLoading(false)
  }

  const loadAll = async () => {
    fetchUsers()
    // Analysts
    setAnalystLoading(true)
    fetchAnalysts().then(list => { setAnalysts(list); setAnalystLoading(false) }).catch(e => { setAnalystError(e.message); setAnalystLoading(false) })
    fetchAllClients().then(list => { setClients(list); setClientsLoading(false) }).catch(e => { setClientsError(e.message); setClientsLoading(false) })
    fetchClientRequests().then(list => { setClientRequests(list); setRequestsLoading(false) }).catch(() => { setRequestsLoading(false) })
    // Client types
    setCtLoading(true)
    fetchClientTypesAdmin().then(list => { setClientTypes(list); setCtLoading(false) }).catch(e => { setCtError(e.message); setCtLoading(false) })
    // Project types
    setPtLoading(true)
    fetchProjectTypes().then(list => { setProjectTypes(list); setPtLoading(false) }).catch(e => { setPtError(e.message); setPtLoading(false) })
  }

  useEffect(() => {
    // Force session refresh before firing parallel fetches.
    // After inactivity, the Supabase token may be stale; fetches that race
    // against the silent refresh hang forever and spinners never clear.
    supabase.auth.getSession().then(() => {
      loadAll()
      fetchAppSettings().then(s => {
        setCurrentLogoUrl(s.logo_url || null)
        setCurrentLoginIconUrl(s.login_icon_url || null)
        setSsoEnabledState(s.sso_enabled === 'true')
        setSsoDomainState(s.sso_domain || '')
      }).catch(() => {})
    })
  }, [])

  useEffect(() => {
    setNotifLoading(true)
    fetchNotificationSettings()
      .then(data => setNotifSettings(data))
      .catch(() => {})
      .finally(() => setNotifLoading(false))
  }, [])

  const handleNotifToggle = async (id: string, current: boolean) => {
    setNotifSaving(id)
    try {
      await updateNotificationSetting(id, !current)
      setNotifSettings(prev => prev.map(s => s.id === id ? { ...s, setting_value: !current } : s))
    } catch {
      alert('Failed to update setting')
    } finally {
      setNotifSaving(null)
    }
  }

  const handleSsoSave = async () => {
    setSsoSaving(true)
    setSsoError('')
    setSsoSuccess('')
    try {
      await updateAppSetting('sso_enabled', ssoEnabledState ? 'true' : 'false')
      await updateAppSetting('sso_domain', ssoDomainState.trim())
      setSsoSuccess('SSO settings saved.')
    } catch (err: any) {
      setSsoError(err?.message ?? 'Failed to save SSO settings')
    } finally {
      setSsoSaving(false)
    }
  }

  useEffect(() => {
    setUserPage(1)
    setSelectedUserIds(new Set())
  }, [userSearch, userStatusFilter])

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }

  const getAccessToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return session.access_token
  }

  // ── User CRUD ─────────────────────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUser.email || !newUser.password || !newUser.full_name) return
    setCreating(true); setError(null)
    try {
      const { error } = await supabase.rpc('admin_create_user', { p_email: newUser.email, p_password: newUser.password, p_full_name: newUser.full_name, p_role: newUser.role })
      if (error) throw error
      setNewUser({ email: '', full_name: '', password: '', role: 'user' })
      await fetchUsers()
      showSuccess(`User ${newUser.email} created successfully!`)
    } catch (err: any) { setError(err.message || 'Failed to create user') }
    finally { setCreating(false) }
  }

  const startEdit = (user: UserProfile) => { setEditId(user.id); setEditForm({ full_name: user.full_name, role: user.role, is_active: user.is_active ?? true }) }
  const cancelEdit = () => setEditId(null)
  const saveEdit = async (id: string) => {
    setError(null)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: editForm.full_name, role: editForm.role, is_active: editForm.is_active, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setEditId(null); await fetchUsers(); showSuccess('User updated successfully!')
    } catch (err: any) { setError(err.message || 'Failed to update user') }
  }

  // ── User management handlers ───────────────────────────────────────────────
  const toggleSelectUser = (id: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedUserIds(prev => {
        const next = new Set(prev)
        pagedUsers.forEach(u => next.delete(u.id))
        return next
      })
    } else {
      setSelectedUserIds(prev => {
        const next = new Set(prev)
        pagedUsers.forEach(u => next.add(u.id))
        return next
      })
    }
  }

  const quickToggleActive = async (user: UserProfile) => {
    const newActive = !(user.is_active ?? true)
    const { error } = await supabase.from('profiles').update({ is_active: newActive, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (!error) {
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newActive } : u))
      showSuccess(`${user.full_name || user.email} ${newActive ? 'activated' : 'deactivated'}.`)
    } else {
      setError(error.message)
    }
  }

  const handleResendWelcome = async (userEmail: string, userFullName: string) => {
    setSendingWelcomeFor(userEmail)
    try {
      // Generate new temp password and reset in DB
      const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
      const lower   = 'abcdefghjkmnpqrstuvwxyz'
      const digits  = '23456789'
      const special = '!@#$%^&*'
      const pick = (charset: string) => {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        return charset[arr[0] % charset.length]
      }
      const all = upper + lower + digits + special
      const chars = [
        pick(upper), pick(upper), pick(lower), pick(lower),
        pick(digits), pick(digits), pick(special), pick(special),
        ...Array.from({ length: 4 }, () => pick(all))
      ]
      for (let i = chars.length - 1; i > 0; i--) {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        const j = arr[0] % (i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
      }
      const tempPassword = chars.join('')

      // Reset password in DB + set password_change_required = true
      const { error: resetErr } = await supabase.rpc('admin_reset_user_password', {
        p_email: userEmail,
        p_new_password: tempPassword,
      })
      if (resetErr) throw new Error(resetErr.message)

      // Send welcome email
      const res = await fetch('/api/send-welcome', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ to: userEmail, full_name: userFullName, temp_password: tempPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      alert(`Welcome email sent to ${userEmail}. Their password has been reset and they must change it on next login.`)
    } catch (err: any) {
      alert(`Failed to send welcome email: ${err.message}`)
    } finally {
      setSendingWelcomeFor(null)
    }
  }

  const bulkDeactivate = async () => {
    if (selectedUserIds.size === 0) return
    if (!window.confirm(`Deactivate ${selectedUserIds.size} selected user(s)? They will lose access immediately.`)) return
    setBulkDeactivating(true)
    try {
      // Never bulk-deactivate super_admin users
      const ids = Array.from(selectedUserIds).filter(id => {
        const u = users.find(u => u.id === id)
        return u?.role !== 'super_admin' || isSuperAdmin
      })
      if (ids.length === 0) { showSuccess('No eligible users to deactivate.'); return }
      const { error } = await supabase.from('profiles').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', ids)
      if (error) throw error
      setUsers(prev => prev.map(u => selectedUserIds.has(u.id) ? { ...u, is_active: false } : u))
      setSelectedUserIds(new Set())
      showSuccess(`${ids.length} user(s) deactivated.`)
    } catch (err: any) {
      setError(err.message || 'Bulk deactivate failed')
    } finally {
      setBulkDeactivating(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteUserTarget || deleteConfirmEmail.trim().toLowerCase() !== deleteUserTarget.email.toLowerCase()) return
    setDeleting(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: deleteUserTarget.id })
      if (error) throw error
      setUsers(prev => prev.filter(u => u.id !== deleteUserTarget.id))
      setDeleteUserTarget(null)
      setDeleteConfirmEmail('')
      showSuccess(`User ${deleteUserTarget.email} permanently deleted.`)
    } catch (err: any) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setDeleting(false)
    }
  }

  // ── Analyst handlers ──────────────────────────────────────────────────────
  const handleAddAnalyst = async (name: string) => {
    setAnalystError(null)
    try {
      const created = await createAnalyst(name)
      setAnalysts(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      showSuccess(`Analyst "${created.name}" added!`)
    } catch (err: any) {
      setAnalystError(err.message?.includes('unique') ? 'An analyst with that name already exists.' : err.message || 'Failed to add analyst')
      throw err
    }
  }

  const handleEditAnalyst = async (id: number, name: string) => {
    setAnalystError(null)
    try {
      await updateAnalyst(id, name)
      setAnalysts(prev => prev.map(a => a.id === id ? { ...a, name } : a).sort((a, b) => a.name.localeCompare(b.name)))
      showSuccess('Analyst updated!')
    } catch (err: any) {
      setAnalystError(err.message || 'Failed to update analyst'); throw err
    }
  }

  const handleRemoveAnalyst = async (item: ListItem) => {
    if (!window.confirm(`Remove analyst "${item.name}"? They won't appear in new project forms.`)) return
    try {
      await deactivateAnalyst(item.id)
      setAnalysts(prev => prev.filter(a => a.id !== item.id))
      showSuccess(`Analyst "${item.name}" removed.`)
    } catch (err: any) { setAnalystError(err.message || 'Failed to remove analyst') }
  }

  // ── Client Type handlers ───────────────────────────────────────────────────
  const handleAddClientType = async (name: string) => {
    setCtError(null)
    try {
      const created = await createClientType(name)
      setClientTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      showSuccess(`Client Type "${created.name}" added!`)
    } catch (err: any) {
      setCtError(err.message?.includes('unique') ? 'A client type with that name already exists.' : err.message || 'Failed to add client type')
      throw err
    }
  }

  const handleEditClientType = async (id: number, name: string) => {
    setCtError(null)
    try {
      await updateClientType(id, name)
      setClientTypes(prev => prev.map(ct => ct.id === id ? { ...ct, name } : ct).sort((a, b) => a.name.localeCompare(b.name)))
      showSuccess('Client Type updated!')
    } catch (err: any) { setCtError(err.message || 'Failed to update client type'); throw err }
  }

  const handleRemoveClientType = async (item: ListItem) => {
    if (!window.confirm(`Remove client type "${item.name}"?`)) return
    try {
      await deactivateClientType(item.id)
      setClientTypes(prev => prev.filter(ct => ct.id !== item.id))
      showSuccess(`Client Type "${item.name}" removed.`)
    } catch (err: any) { setCtError(err.message || 'Failed to remove client type') }
  }

  // ── Project Type handlers ─────────────────────────────────────────────────
  const handleAddProjectType = async (name: string, file?: File) => {
    setPtError(null)
    try {
      const token = file ? await getAccessToken() : undefined
      const created = await createProjectType(name, file, token)
      setProjectTypes(prev => [...prev, created])
      showSuccess(`Project Type "${created.name}" added!`)
    } catch (err: any) {
      setPtError(err.message?.includes('unique') ? 'A project type with that name already exists.' : err.message || 'Failed to add project type')
      throw err
    }
  }

  const handleEditProjectType = async (id: number, name: string, file?: File) => {
    setPtError(null)
    try {
      const token = file ? await getAccessToken() : undefined
      await updateProjectType(id, name, file, token)
      // Refresh the full list to get updated template_url
      const updated = await fetchProjectTypes()
      setProjectTypes(updated)
      showSuccess('Project Type updated!')
    } catch (err: any) { setPtError(err.message || 'Failed to update project type'); throw err }
  }

  const handleRemoveProjectType = async (item: ListItem) => {
    if (!window.confirm(`Remove project type "${item.name}"?`)) return
    try {
      await deactivateProjectType(item.id)
      setProjectTypes(prev => prev.filter(pt => pt.id !== item.id))
      showSuccess(`Project Type "${item.name}" removed.`)
    } catch (err: any) { setPtError(err.message || 'Failed to remove project type') }
  }

  // Filtered + paginated users
  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase()
    const matchSearch = !q || u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchStatus =
      userStatusFilter === 'all' ? true :
      userStatusFilter === 'active' ? (u.is_active !== false) :
      (u.is_active === false)
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE))
  const pagedUsers = filteredUsers.slice((userPage - 1) * USERS_PER_PAGE, userPage * USERS_PER_PAGE)
  const allPageSelected = pagedUsers.length > 0 && pagedUsers.every(u => selectedUserIds.has(u.id))

  // ── Bulk User Management overlay ─────────────────────────────────────────
  if (showBulkUsers) {
    return <BulkUserPage onBack={() => { setShowBulkUsers(false); fetchUsers() }} />
  }

  return (
    <>
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={22} className="text-primary" /> Admin Panel
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">Manage users, lookup lists, and system settings</p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={loadAll}><RefreshCw size={14} /> Refresh</button>
      </div>

      {/* Global alerts */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={18} /><span>{error}</span>
          <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="alert alert-success"><CheckCircle2 size={18} /><span>{success}</span></div>
      )}

      {/* ── Branding Section ──────────────────────────────────────────────────── */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body">
          <h3 className="card-title text-base flex items-center gap-2">
            <Image size={18} className="text-primary" /> Branding
          </h3>
          <p className="text-xs text-base-content/50 mb-3">Upload a company logo to display on the login page, dashboard, and email notifications.</p>

          {logoError && (
            <div className="alert alert-error py-2 mb-3">
              <AlertCircle size={14} />
              <span className="text-sm">{logoError}</span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setLogoError('')}><X size={11} /></button>
            </div>
          )}
          {logoSuccess && (
            <div className="alert alert-success py-2 mb-3">
              <CheckCircle2 size={14} />
              <span className="text-sm">{logoSuccess}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-6">
            {/* Current logo preview */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-base-content/50 font-medium">Current Logo</span>
              {currentLogoUrl ? (
                <div className="p-3 bg-base-100 border border-base-300 rounded-xl">
                  <img
                    src={currentLogoUrl}
                    alt="Current Logo"
                    className="max-h-20 max-w-xs object-contain"
                    style={{ maxHeight: '80px' }}
                  />
                </div>
              ) : (
                <div className="p-4 bg-base-100 border border-dashed border-base-300 rounded-xl text-base-content/30 text-xs">
                  No logo set
                </div>
              )}
            </div>

            {/* Upload controls */}
            <div className="flex flex-col gap-3">
              <label className="btn btn-primary btn-sm gap-1.5 cursor-pointer">
                <Upload size={14} />
                {logoUploading ? 'Uploading…' : 'Upload New Logo'}
                <input
                  ref={logoFileRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  disabled={logoUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadLogo(file)
                    if (logoFileRef.current) logoFileRef.current.value = ''
                  }}
                />
              </label>
              <p className="text-xs text-base-content/40">PNG, JPEG, SVG or WebP · max 2MB</p>
              {currentLogoUrl && (
                <button
                  className="btn btn-ghost btn-sm gap-1.5 text-error/70 hover:text-error hover:bg-error/10"
                  onClick={removeLogo}
                  disabled={logoUploading}
                >
                  <Trash2 size={13} /> Remove Logo
                </button>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="divider my-2" />

          {/* ── Login Page Icon ── */}
          <h4 className="text-sm font-semibold text-base-content/70 flex items-center gap-2">
            Login Page Icon
            <span className="badge badge-ghost badge-sm">optional</span>
          </h4>
          <p className="text-xs text-base-content/40 mb-3">
            Replaces the default icon on the login page. Leave empty to show no icon.
          </p>

          {loginIconError && (
            <div className="alert alert-error py-2 mb-3">
              <AlertCircle size={14} />
              <span className="text-sm">{loginIconError}</span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setLoginIconError('')}><X size={11} /></button>
            </div>
          )}
          {loginIconSuccess && (
            <div className="alert alert-success py-2 mb-3">
              <CheckCircle2 size={14} />
              <span className="text-sm">{loginIconSuccess}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-base-content/50 font-medium">Current Icon</span>
              {currentLoginIconUrl ? (
                <div className="p-3 bg-base-100 border border-base-300 rounded-xl">
                  <img
                    src={currentLoginIconUrl}
                    alt="Login Icon"
                    className="max-h-16 max-w-[160px] object-contain"
                  />
                </div>
              ) : (
                <div className="p-4 bg-base-100 border border-dashed border-base-300 rounded-xl text-base-content/30 text-xs">
                  No icon set
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <label className="btn btn-primary btn-sm gap-1.5 cursor-pointer">
                <Upload size={14} />
                {loginIconUploading ? 'Uploading…' : 'Upload Icon'}
                <input
                  ref={loginIconFileRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg"
                  disabled={loginIconUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadLoginIcon(file)
                    if (loginIconFileRef.current) loginIconFileRef.current.value = ''
                  }}
                />
              </label>
              <p className="text-xs text-base-content/40">PNG or JPEG · max 2MB · auto-sized</p>
              {currentLoginIconUrl && (
                <button
                  className="btn btn-ghost btn-sm gap-1.5 text-error/70 hover:text-error hover:bg-error/10"
                  onClick={removeLoginIcon}
                  disabled={loginIconUploading}
                >
                  <Trash2 size={13} /> Remove Icon
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Create User Form */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body">
          <h3 className="card-title text-base flex items-center gap-2"><UserPlus size={18} className="text-primary" /> Create New User</h3>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Full Name <span className="text-error">*</span></span></label>
              <input className="input input-bordered input-sm" placeholder="Jane Smith" value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} required />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Email <span className="text-error">*</span></span></label>
              <input type="email" className="input input-bordered input-sm" placeholder="jane@company.com" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} required />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Password <span className="text-error">*</span></span></label>
              <input type="password" className="input input-bordered input-sm" placeholder="Min. 8 characters" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} minLength={8} required />
            </div>
            <div className="form-control">
              <label className="label py-0"><span className="label-text text-xs font-medium">Role</span></label>
              <div className="flex gap-2">
                <select className="select select-bordered select-sm flex-1" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value as any }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                </select>
                <button type="submit" className={`btn btn-primary btn-sm gap-1.5 ${creating ? 'loading' : ''}`} disabled={creating}>
                  {!creating && <UserPlus size={14} />}{creating ? '…' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Managed Lists — 3 columns on large screens */}
      {/* ── Clients Management ──────────────────────────────────────────────── */}
      <div className="card bg-base-100 border border-base-300 shadow-sm mb-4">
        <div className="card-body gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              <div>
                <h3 className="font-semibold text-base-content">Client Names</h3>
                <p className="text-xs text-base-content/50">Upload CSV or add manually · 2 columns: Name, ID (optional)</p>
              </div>
            </div>
            <span className="badge badge-ghost">{clients.filter(c => c.is_active).length} active</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap p-3 bg-base-200 rounded-lg border border-base-300">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Import from CSV</p>
              <p className="text-xs text-base-content/50">First column: Client Name · Second column (optional): Client ID · First row = header (skipped)</p>
            </div>
            <input ref={clientCsvRef} type="file" accept=".csv" className="hidden"
              onChange={e => setClientCsvFile(e.target.files?.[0] || null)} />
            <button type="button" className="btn btn-outline btn-sm gap-1"
              onClick={() => clientCsvRef.current?.click()}>
              <Upload size={14} /> {clientCsvFile ? clientCsvFile.name : 'Choose CSV'}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!clientCsvFile || clientCsvImporting}
              onClick={async () => {
                if (!clientCsvFile) return
                setClientCsvImporting(true); setClientCsvResult(null); setClientCsvError(null)
                try {
                  const text = await clientCsvFile.text()
                  const rows = text.split('\n').slice(1).map(line => {
                    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
                    return { name: cols[0] || '', external_id: cols[1] || '' }
                  }).filter(r => r.name)
                  const result = await importClients(rows)
                  setClientCsvResult(result); setClientCsvFile(null)
                  if (clientCsvRef.current) clientCsvRef.current.value = ''
                  fetchAllClients().then(setClients)
                } catch (e: any) { setClientCsvError(e.message) } finally { setClientCsvImporting(false) }
              }}>
              {clientCsvImporting ? <span className="loading loading-spinner loading-xs" /> : 'Import'}
            </button>
          </div>
          {clientCsvResult && <div className="alert alert-success py-1 px-3 text-xs">Imported {clientCsvResult.inserted} new · {clientCsvResult.skipped} skipped (duplicates)</div>}
          {clientCsvError && <div className="alert alert-error py-1 px-3 text-xs">{clientCsvError}</div>}
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="label py-0"><span className="label-text text-xs">Client Name</span></label>
              <input className="input input-bordered input-sm w-full" placeholder="e.g. Acme Corp"
                value={newClientName} onChange={e => setNewClientName(e.target.value)} />
            </div>
            <div className="w-32">
              <label className="label py-0"><span className="label-text text-xs">Client ID (opt)</span></label>
              <input className="input input-bordered input-sm w-full" placeholder="e.g. 1234"
                value={newClientExtId} onChange={e => setNewClientExtId(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary btn-sm gap-1" disabled={!newClientName.trim() || addingClient}
              onClick={async () => {
                if (!newClientName.trim()) return
                setAddingClient(true)
                try {
                  const c = await createClient(newClientName, newClientExtId || undefined)
                  setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
                  setNewClientName(''); setNewClientExtId('')
                } catch (e: any) { setClientsError(e.message) } finally { setAddingClient(false) }
              }}>
              {addingClient ? <span className="loading loading-spinner loading-xs" /> : <><Plus size={13} /> Add</>}
            </button>
          </div>
          {clientsLoading ? (
            <div className="flex justify-center py-4"><span className="loading loading-spinner loading-sm" /></div>
          ) : clientsError ? (
            <div className="alert alert-error py-1 px-3 text-xs">{clientsError}</div>
          ) : clients.length === 0 ? (
            <p className="text-xs text-base-content/40">No clients yet — add one above or import CSV.</p>
          ) : (
            <>
              {/* search + count bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-base-content/40" />
                  <input
                    className="input input-bordered input-xs w-full pl-7"
                    placeholder="Search by name or ID…"
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setClientPage(0) }}
                  />
                </div>
                <span className="text-xs text-base-content/40 shrink-0">
                  {clients.filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.external_id || '').toLowerCase().includes(clientSearch.toLowerCase())).length} / {clients.length}
                </span>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="table table-xs w-full">
                <thead className="sticky top-0 bg-base-100 z-10"><tr><th>Name</th><th>Client ID</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {(() => {
                    const filtered = clients.filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.external_id || '').toLowerCase().includes(clientSearch.toLowerCase()))
                    const PAGE_SIZE = 25
                    const page = clientPage
                    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                    return paged
                  })().map(c => (
                    <tr key={c.id} className={!c.is_active ? 'opacity-40' : ''}>
                      {editClientId === c.id ? (
                        <td colSpan={3}>
                          <div className="flex gap-2">
                            <input className="input input-bordered input-xs flex-1" value={editClientName} onChange={e => setEditClientName(e.target.value)} />
                            <input className="input input-bordered input-xs w-24" placeholder="ID" value={editClientExtId} onChange={e => setEditClientExtId(e.target.value)} />
                          </div>
                        </td>
                      ) : (
                        <><td className="font-medium">{c.name}</td><td className="text-base-content/50">{c.external_id || '—'}</td>
                        <td><span className={`badge badge-xs ${c.is_active ? 'badge-success' : 'badge-ghost'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td></>
                      )}
                      <td>
                        {editClientId === c.id ? (
                          <div className="flex gap-1">
                            <button className="btn btn-success btn-xs" disabled={savingClient} onClick={async () => {
                              setSavingClient(true)
                              try {
                                await updateClient(c.id, editClientName, editClientExtId || undefined)
                                setClients(prev => prev.map(x => x.id === c.id ? { ...x, name: editClientName, external_id: editClientExtId || null } : x))
                                setEditClientId(null)
                              } catch (e: any) { setClientsError(e.message) } finally { setSavingClient(false) }
                            }}>{savingClient ? <span className="loading loading-spinner loading-xs" /> : <Save size={11} />}</button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setEditClientId(null)}><X size={11} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button className="btn btn-ghost btn-xs" onClick={() => { setEditClientId(c.id); setEditClientName(c.name); setEditClientExtId(c.external_id || '') }}><Edit2 size={11} /></button>
                            {c.is_active && <button className="btn btn-ghost btn-xs text-error" onClick={async () => {
                              if (window.confirm('Deactivate "' + c.name + '"?')) {
                                await deactivateClient(c.id)
                                setClients(prev => prev.map(x => x.id === c.id ? { ...x, is_active: false } : x))
                              }
                            }}><Trash2 size={11} /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* pagination */}
              {(() => {
                const filtered = clients.filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.external_id || '').toLowerCase().includes(clientSearch.toLowerCase()))
                const PAGE_SIZE = 25
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
                if (totalPages <= 1) return null
                return (
                  <div className="flex items-center justify-between mt-2">
                    <button className="btn btn-ghost btn-xs" disabled={clientPage === 0} onClick={() => setClientPage(p => p - 1)}>
                      <ChevronLeft size={12} /> Prev
                    </button>
                    <span className="text-xs text-base-content/50">Page {clientPage + 1} of {totalPages}</span>
                    <button className="btn btn-ghost btn-xs" disabled={clientPage >= totalPages - 1} onClick={() => setClientPage(p => p + 1)}>
                      Next <ChevronRight size={12} />
                    </button>
                  </div>
                )
              })()}
            </>
          )}
          {(() => {
            const pending = clientRequests.filter(r => r.status === 'pending')
            if (requestsLoading || pending.length === 0) return null
            return (
              <div className="mt-2 border-t border-base-300 pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge badge-warning badge-sm">{pending.length}</span>
                  <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">Pending Client Requests</span>
                </div>
                <div className="flex flex-col gap-2">
                  {pending.map(req => (
                    <div key={req.id} className="p-3 bg-warning/10 border border-warning/30 rounded-lg">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-semibold">"{req.requested_name}"</p>
                          <p className="text-xs text-base-content/50">by {req.requester_name || 'Unknown'} · {new Date(req.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          {reassignRequestId === req.id ? (
                            <div className="flex gap-2 items-center">
                              <select className="select select-bordered select-xs" value={reassignClientId} onChange={e => setReassignClientId(e.target.value)}>
                                <option value="">— Pick existing —</option>
                                {clients.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              <button className="btn btn-warning btn-xs" disabled={!reassignClientId} onClick={async () => {
                                if (!reassignClientId) return
                                try {
                                  await approveClientRequest(req.id, parseInt(reassignClientId))
                                  setClientRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'reassigned' as const } : r))
                                  fetchAllClients().then(setClients); setReassignRequestId(null)
                                } catch (e: any) { setClientsError(e.message) }
                              }}>Reassign</button>
                              <button className="btn btn-ghost btn-xs" onClick={() => setReassignRequestId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              <button className="btn btn-success btn-xs gap-1" onClick={async () => {
                                try {
                                  await approveClientRequest(req.id)
                                  setClientRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' as const } : r))
                                  fetchAllClients().then(setClients)
                                } catch (e: any) { setClientsError(e.message) }
                              }}><CheckCircle2 size={11} /> Approve</button>
                              <button className="btn btn-outline btn-xs gap-1" onClick={() => { setReassignRequestId(req.id); setReassignClientId('') }}><RefreshCw size={11} /> Reassign</button>
                              <button className="btn btn-ghost btn-xs text-error gap-1" onClick={async () => {
                                if (window.confirm('Reject this request?')) {
                                  await rejectClientRequest(req.id)
                                  setClientRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' as const } : r))
                                }
                              }}><X size={11} /> Reject</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ManagedList
          title="Analysts"
          subtitle="Names that appear in the Analyst dropdown when creating or editing projects."
          icon={<Users size={18} className="text-primary" />}
          items={analysts}
          loading={analystLoading}
          error={analystError}
          onClearError={() => setAnalystError(null)}
          onAdd={handleAddAnalyst}
          onEdit={handleEditAnalyst}
          onRemove={handleRemoveAnalyst}
        />
        <ManagedList
          title="Client Types"
          subtitle="Available client type options in the project form."
          icon={<Tag size={18} className="text-secondary" />}
          items={clientTypes}
          loading={ctLoading}
          error={ctError}
          onClearError={() => setCtError(null)}
          onAdd={handleAddClientType}
          onEdit={handleEditClientType}
          onRemove={handleRemoveClientType}
        />
        <ManagedList
          title="Project Types"
          subtitle="Project type options with optional downloadable templates."
          icon={<Layers size={18} className="text-accent" />}
          items={projectTypes}
          loading={ptLoading}
          error={ptError}
          onClearError={() => setPtError(null)}
          onAdd={handleAddProjectType}
          onEdit={handleEditProjectType}
          onRemove={handleRemoveProjectType}
          withTemplateUpload
          templateItems={projectTypes}
        />
      </div>

      {/* Users Table */}
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="card-title text-base flex items-center gap-2">
                <Users size={18} className="text-primary" /> User Management
              </h3>
              <p className="text-xs text-base-content/50 mt-0.5">
                {filteredUsers.length} of {users.length} users
                {selectedUserIds.size > 0 && <span className="ml-2 text-warning font-medium">· {selectedUserIds.size} selected</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Bulk Import */}
              <button
                className="btn btn-outline btn-sm gap-1.5"
                onClick={() => setShowBulkUsers(true)}
                title="Bulk create or update users via CSV"
              >
                <Upload size={14} />
                Bulk Import
              </button>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  className="input input-bordered input-sm pl-8 w-56"
                  placeholder="Search name or email…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
                {userSearch && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content" onClick={() => setUserSearch('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
              {/* Status filter pills */}
              <div className="join">
                {(['all', 'active', 'inactive'] as const).map(f => (
                  <button
                    key={f}
                    className={`join-item btn btn-xs capitalize ${userStatusFilter === f ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                    onClick={() => setUserStatusFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedUserIds.size > 0 && (
            <div className="mx-6 mb-3 flex items-center gap-3 px-4 py-2.5 bg-warning/10 border border-warning/30 rounded-lg">
              <span className="text-sm font-medium text-warning">{selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected</span>
              <button
                className={`btn btn-error btn-sm gap-1.5 ${bulkDeactivating ? 'loading' : ''}`}
                onClick={bulkDeactivate}
                disabled={bulkDeactivating}
              >
                {!bulkDeactivating && <UserX size={14} />} Deactivate Selected
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUserIds(new Set())}>
                <X size={14} /> Clear
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-base-content/40">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{userSearch ? `No users match "${userSearch}"` : 'No users found.'}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr className="bg-base-300/50">
                      <th className="w-10">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={allPageSelected}
                          onChange={toggleSelectAllPage}
                          title="Select all on this page"
                        />
                      </th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.map(user => (
                      <tr key={user.id} className={`${!user.is_active ? 'opacity-50' : ''} ${selectedUserIds.has(user.id) ? 'bg-primary/5' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar placeholder">
                              <div className="bg-primary/20 text-primary rounded-full w-8">
                                <span className="text-xs font-bold">{user.full_name?.[0]?.toUpperCase() || user.email[0]?.toUpperCase()}</span>
                              </div>
                            </div>
                            {editId === user.id ? (
                              <input className="input input-bordered input-xs w-32" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
                            ) : (
                              <span className="font-medium">{user.full_name}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-sm text-base-content/70">{user.email}</td>
                        <td>
                          {editId === user.id ? (
                            <select className="select select-bordered select-xs" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as any }))} disabled={user.role === 'super_admin' && !isSuperAdmin}>
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                            </select>
                          ) : (
                            <span className={`badge badge-sm ${user.role === 'super_admin' ? 'badge-warning' : user.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`}>
                              {user.role === 'super_admin' ? <><Shield size={10} className="mr-1" />Super Admin</> : user.role === 'admin' ? <><Shield size={10} className="mr-1" />Admin</> : <><User size={10} className="mr-1" />User</>}
                            </span>
                          )}
                        </td>
                        <td>
                          {editId === user.id ? (
                            <input type="checkbox" className="toggle toggle-success toggle-sm" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                          ) : (
                            <span className={`badge badge-sm ${user.is_active !== false ? 'badge-success' : 'badge-error'}`}>
                              {user.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          )}
                        </td>
                        <td className="text-xs text-base-content/50">{new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td>
                          <div className="flex gap-1">
                            {editId === user.id ? (
                              <>
                                <button className="btn btn-success btn-xs gap-1" onClick={() => saveEdit(user.id)}><Save size={12} /> Save</button>
                                <button className="btn btn-ghost btn-xs" onClick={cancelEdit}><X size={12} /></button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn-ghost btn-xs gap-1" onClick={() => startEdit(user)} title="Edit name/role">
                                  <Edit2 size={12} /> Edit
                                </button>
                                <button
                                  className={`btn btn-xs gap-1 ${user.is_active !== false ? 'btn-ghost text-error/70 hover:text-error hover:bg-error/10' : 'btn-ghost text-success/70 hover:text-success hover:bg-success/10'}`}
                                  onClick={() => quickToggleActive(user)}
                                  disabled={user.role === 'super_admin' && !isSuperAdmin}
                                  title={user.role === 'super_admin' && !isSuperAdmin ? 'Cannot modify Super Admin' : user.is_active !== false ? 'Deactivate user' : 'Reactivate user'}
                                >
                                  {user.is_active !== false ? <><UserX size={12} /> Deactivate</> : <><UserCheck size={12} /> Activate</>}
                                </button>
                                {user.role !== 'admin' && (
                                  <button
                                    className="btn btn-ghost btn-xs gap-1 text-info"
                                    onClick={() => handleResendWelcome(user.email, user.full_name)}
                                    disabled={sendingWelcomeFor === user.email}
                                    title="Reset password and send welcome email"
                                  >
                                    {sendingWelcomeFor === user.email
                                      ? <span className="loading loading-spinner loading-xs" />
                                      : <Mail className="w-3.5 h-3.5" />
                                    }
                                  </button>
                                )}
                                {isSuperAdmin && (
                                  <button
                                    className="btn btn-ghost btn-xs text-error/50 hover:text-error hover:bg-error/10"
                                    onClick={() => { setDeleteUserTarget(user); setDeleteConfirmEmail('') }}
                                    title="Permanently delete user"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-base-300">
                  <span className="text-xs text-base-content/50">
                    Showing {(userPage - 1) * USERS_PER_PAGE + 1}–{Math.min(userPage * USERS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length}
                  </span>
                  <div className="join">
                    <button
                      className="join-item btn btn-xs btn-ghost"
                      disabled={userPage === 1}
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button className="join-item btn btn-xs btn-ghost pointer-events-none">
                      {userPage} / {totalPages}
                    </button>
                    <button
                      className="join-item btn btn-xs btn-ghost"
                      disabled={userPage === totalPages}
                      onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Notification Settings ─────────────────────────────────────────── */}
      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Bell size={16} className="text-violet-600" />
            </div>
            <div>
              <h3 className="font-semibold text-base-content">Notification Settings</h3>
              <p className="text-xs text-base-content/50">Control which events trigger email notifications to requestors</p>
            </div>
          </div>

          {notifLoading ? (
            <div className="flex items-center gap-2 text-sm text-base-content/40 py-4">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {notifSettings.map(setting => {
                const icons: Record<string, React.ReactNode> = {
                  notify_on_status_change: <span className="text-base">🔄</span>,
                  notify_on_completed: <span className="text-base">✅</span>,
                  notify_on_delivery_file_upload: <span className="text-base">📁</span>,
                  notify_daily_summary: <span className="text-base">📊</span>,
                  notify_project_owner: <span className="text-base">👤</span>,
                }
                const descriptions: Record<string, string> = {
                  notify_on_status_change: 'Requestor receives an email when project status is changed',
                  notify_on_completed: 'Requestor receives a completion email when project is marked Completed',
                  notify_on_delivery_file_upload: 'Requestor receives an email when a delivery file is uploaded to their project',
                  notify_daily_summary: 'Admin receives a daily digest of all project activity (coming soon)',
                  notify_project_owner: 'Also send notifications to the project owner in addition to requestor',
                }
                return (
                  <div
                    key={setting.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                      setting.setting_value
                        ? 'bg-success/5 border-success/20'
                        : 'bg-base-200 border-base-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                        setting.setting_value ? 'bg-success/15' : 'bg-base-300'
                      }`}>
                        {icons[setting.setting_key] || <Bell size={14} />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-base-content">{setting.label || setting.setting_key}</div>
                        <div className="text-xs text-base-content/50 mt-0.5">{descriptions[setting.setting_key] || setting.description || ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${setting.setting_value ? 'text-success' : 'text-base-content/30'}`}>
                        {setting.setting_value ? 'ON' : 'OFF'}
                      </span>
                      {notifSaving === setting.id ? (
                        <Loader2 size={16} className="animate-spin text-base-content/40" />
                      ) : (
                        <input
                          type="checkbox"
                          className="toggle toggle-sm toggle-success"
                          checked={setting.setting_value}
                          onChange={() => handleNotifToggle(setting.id, setting.setting_value)}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-4 p-3 bg-base-200 rounded-xl flex items-start gap-2">
            <Mail size={13} className="text-base-content/40 mt-0.5 shrink-0" />
            <p className="text-xs text-base-content/50 leading-relaxed">
              Emails are sent via <strong>Resend</strong>. To switch to Office 365, set <code className="bg-base-300 px-1 rounded text-xs">EMAIL_PROVIDER=graph</code> in Vercel environment variables and configure Azure App Registration credentials.
            </p>
          </div>
        </div>
      </div>

      {/* ── SSO / Authentication Settings ──────────────────────────────── */}
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body gap-4">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-primary" />
            <h2 className="font-semibold text-base-content">SSO / Authentication</h2>
          </div>
          <p className="text-xs text-base-content/50 -mt-2">
            Configure Single Sign-On via Okta. When enabled, the login page shows an Okta SSO button as the primary sign-in option.
            Password login always remains available as a fallback.
          </p>

          {ssoError && (
            <div className="alert alert-error py-2">
              <AlertCircle size={14} />
              <span className="text-sm">{ssoError}</span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setSsoError('')}><X size={11} /></button>
            </div>
          )}
          {ssoSuccess && (
            <div className="alert alert-success py-2">
              <CheckCircle2 size={14} />
              <span className="text-sm">{ssoSuccess}</span>
              <button className="btn btn-ghost btn-xs ml-auto" onClick={() => setSsoSuccess('')}><X size={11} /></button>
            </div>
          )}

          {/* Enable/disable toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-base-content">Enable SSO Login</p>
              <p className="text-xs text-base-content/50">Shows "Sign in with Okta SSO" button on login page</p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={ssoEnabledState}
              onChange={e => { setSsoEnabledState(e.target.checked); setSsoSuccess('') }}
            />
          </div>

          {/* SSO Domain */}
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text text-sm font-medium">SSO Domain</span>
              <span className="label-text-alt text-xs text-base-content/40">e.g. magnitglobal.com</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder="your-company.com"
              value={ssoDomainState}
              onChange={e => { setSsoDomainState(e.target.value); setSsoSuccess('') }}
            />
          </div>

          <div className="flex justify-end">
            <button
              className="btn btn-primary btn-sm"
              disabled={ssoSaving}
              onClick={handleSsoSave}
            >
              {ssoSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save SSO Settings
            </button>
          </div>

          <div className="text-xs text-base-content/40 border-t border-base-300 pt-3 flex items-start gap-1.5">
            <span>⚙️</span>
            <span>
              To complete SSO setup: (1) configure the Okta SAML/OIDC provider in your Supabase project's Auth settings,
              then (2) enter the SSO domain above and enable the toggle.
            </span>
          </div>
        </div>
      </div>
    </div>

      {/* ── Delete User Modal ─────────────────────────────────────────────── */}
      {deleteUserTarget && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg flex items-center gap-2 text-error">
              <Trash2 size={18} /> Permanently Delete User
            </h3>
            <p className="py-3 text-sm text-base-content/70">
              This will permanently remove <strong>{deleteUserTarget.full_name || deleteUserTarget.email}</strong> and all their associated data from the system. <span className="text-error font-semibold">This cannot be undone.</span>
            </p>
            <p className="text-sm mb-2 font-medium">Type their email address to confirm:</p>
            <input
              className="input input-bordered input-sm w-full"
              placeholder={deleteUserTarget.email}
              value={deleteConfirmEmail}
              onChange={e => setDeleteConfirmEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmEmail.toLowerCase() === deleteUserTarget.email.toLowerCase()) handleDeleteUser() }}
              autoFocus
            />
            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setDeleteUserTarget(null); setDeleteConfirmEmail('') }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={`btn btn-error btn-sm gap-1.5 ${deleting ? 'loading' : ''}`}
                disabled={deleteConfirmEmail.trim().toLowerCase() !== deleteUserTarget.email.toLowerCase() || deleting}
                onClick={handleDeleteUser}
              >
                {!deleting && <Trash2 size={13} />} Delete Permanently
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { if (!deleting) { setDeleteUserTarget(null); setDeleteConfirmEmail('') } }} />
        </div>
      )}
    </>
  )
}
