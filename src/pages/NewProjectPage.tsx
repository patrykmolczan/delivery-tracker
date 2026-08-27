import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Save, X, CheckCircle2, AlertCircle, Plus, Trash2, Edit2, Check,
  Globe, ListTodo, Paperclip, Zap, Download, FileText,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getSession as cognitoGetSession } from '../lib/cognitoAuth'
import {
  fetchLookups, createProject, updateProject, fetchProjects,
  buildLookupMaps, buildPredictionStats, predictDeliveryTime,
  uploadProjectFile, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_PROJECT,
  fetchProjectCountries, fetchProjectTasks, formatFileSize,
  fetchAnalysts, fetchProjectTypes, fetchClients, submitClientRequest,
} from '../lib/data'
import type {
  LookupItem, Project, ProjectFormData,
  ProjectCountryInput, ProjectTaskInput,
} from '../types'
import type { Client } from '../lib/data'
import type { ProjectType } from '../lib/data'
import { parseTemplateFile, type DBCountry } from '../lib/templateParser'
import { analyzeTemplateQuality, type TemplateQualityResult } from '../lib/templateQualityAnalyzer'
import { TemplateQualityReview } from '../components/TemplateQualityReview'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum quality score to submit a new project. Change this one number to raise/lower the bar. */
const PASSING_QUALITY_SCORE = 70


const EMPTY_FORM: ProjectFormData = {
  project_owner: '',
  analyst: '',
  client_type_id: null,
  client_name: '',
  requestor: '',
  date_received: new Date().toISOString().slice(0, 10),
  expected_delivery_date: '',
  date_delivered: '',
  project_summary: '',
  job_count: '',
  status_id: null,
  country_id: null,
  industry_id: null,
  project_type: null,
  time_allocation: '',
  project_countries: [],
  project_tasks: [],
}

// ─── Sub-components (defined outside parent to prevent focus loss) ─────────────

interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
  hint?: string
}

const Field: React.FC<FieldProps> = ({ label, required, error, children, hint }) => (
  <div className="form-control gap-1">
    <label className="label py-0">
      <span className="label-text font-medium text-sm">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </span>
      {hint && <span className="label-text-alt text-base-content/40 text-xs">{hint}</span>}
    </label>
    {children}
    {error && <span className="text-error text-xs">{error}</span>}
  </div>
)

interface SectionProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary/70">{icon}</span>
      <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider">{title}</h3>
    </div>
    {children}
  </div>
)

// ─── ETA Badge ────────────────────────────────────────────────────────────────

interface ETABadgeProps {
  estimate: number
  confidence: string
  breakdown: string
}

const ETABadge: React.FC<ETABadgeProps> = ({ estimate, confidence, breakdown }) => {
  const color = confidence === 'High' ? 'border-success/40 bg-success/5 text-success'
    : confidence === 'Medium' ? 'border-warning/40 bg-warning/5 text-warning'
    : 'border-info/40 bg-info/5 text-info'
  const dot = confidence === 'High' ? 'bg-success' : confidence === 'Medium' ? 'bg-warning' : 'bg-info'

  return (
    <div className={`rounded-xl border p-4 ${color} flex items-start gap-3`}>
      <Zap size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-lg">~{estimate} business days</span>
          <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${color} border`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
            {confidence} confidence
          </span>
        </div>
        <p className="text-xs opacity-70 mt-0.5 truncate">{breakdown}</p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  editProject?: Project | null
  onSaved: (project: Project) => void
  onCancel: () => void
}

export const NewProjectPage: React.FC<Props> = ({ editProject, onSaved, onCancel }) => {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM)
  const [lookups, setLookups] = useState<{ statuses: LookupItem[]; clientTypes: LookupItem[]; industries: LookupItem[]; countries: LookupItem[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showQualityWarning, setShowQualityWarning] = useState(false)
  const [showNoTemplateWarning, setShowNoTemplateWarning] = useState(false)
  const pendingFormRef = useRef<ProjectFormData | null>(null)
  const pendingUserRef = useRef<any>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Analysts list
  const [analysts, setAnalysts] = useState<import('../lib/data').Analyst[]>([])

  // Client name list
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const [clientRequestName, setClientRequestName] = useState('')
  const [clientRequestMode, setClientRequestMode] = useState(false)
  const [clientRequestSubmitting, setClientRequestSubmitting] = useState(false)
  const [clientRequestDone, setClientRequestDone] = useState(false)

  // Project types list
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])

  // ETA prediction
  const [predStats, setPredStats] = useState<ReturnType<typeof buildPredictionStats> | null>(null)
  const [eta, setEta] = useState<{ estimate: number; confidence: string; breakdown: string } | null>(null)

  // Country builder state
  const [countryPickId, setCountryPickId] = useState<string>('')
  const [countryPickJobs, setCountryPickJobs] = useState<string>('')

  // Task builder state
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [editingTaskIdx, setEditingTaskIdx] = useState<number | null>(null)
  const [editTaskTitle, setEditTaskTitle] = useState('')
  const [editTaskDesc, setEditTaskDesc] = useState('')

  // Staged files (for upload after project creation)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Load lookups — session guard redirects immediately on expired session
  useEffect(() => {
    const init = async () => {
      const session = await cognitoGetSession()
      if (!session) { signOut(); return }
      Promise.all([fetchLookups(), fetchProjectTypes(), fetchClients()])
        .then(([lu, pts, cls]) => {
          setLookups(lu)
          setProjectTypes(pts)
          setClients(cls as Client[])
        })
        .catch(err => {
          setError('Failed to load form options: ' + (err.message || 'Unknown error'))
          setLookups({ statuses: [], clientTypes: [], industries: [], countries: [] })
        })
      fetchAnalysts().then(setAnalysts).catch(() => {})
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // For normal users: auto-set Requestor to their name and Date Received to today
  useEffect(() => {
    if (!isAdmin && !editProject) {
      setForm(f => ({
        ...f,
        requestor: profile?.full_name || user?.email || '',
        date_received: new Date().toISOString().slice(0, 10),
      }))
    }
  }, [isAdmin, profile?.full_name, user?.email, editProject])

  // For normal users: auto-set status to "Under Review" on new project creation
  useEffect(() => {
    if (!isAdmin && !editProject && lookups) {
      const underReview = lookups.statuses.find(s => s.name === 'Under Review')
      if (underReview) {
        setForm(f => ({ ...f, status_id: underReview.id }))
      }
    }
  }, [isAdmin, editProject, lookups])

  // Load prediction stats in background — wait for lookups so client_type/industry/status are resolved
  useEffect(() => {
    if (!lookups) return
    fetchProjects(buildLookupMaps(lookups))
      .then(projects => setPredStats(buildPredictionStats(projects)))
      .catch(() => {})
  }, [lookups])

  // Populate form when editing
  useEffect(() => {
    if (!editProject || !lookups) return
    setForm({
      project_owner: editProject.project_owner || '',
      analyst: editProject.analyst || '',
      client_type_id: editProject.client_type_id ?? null,
      client_name: editProject.client_name || '',
      requestor: editProject.requestor || '',
      date_received: editProject.date_received || '',
      expected_delivery_date: editProject.expected_delivery_date || '',
      date_delivered: editProject.date_delivered || '',
      project_summary: editProject.project_summary || '',
      job_count: editProject.job_count?.toString() || '',
      status_id: editProject.status_id ?? null,
      country_id: editProject.country_id ?? null,
      industry_id: editProject.industry_id ?? null,
      project_type: editProject.project_type ?? null,
      time_allocation: editProject.time_allocation?.toString() || '',
      project_countries: [],
      project_tasks: [],
    })

    // Load existing countries and tasks
    fetchProjectCountries(editProject.id).then(countries => {
      const inputs: ProjectCountryInput[] = countries.map(c => ({
        country_id: c.country_id,
        country_name: c.country_name,
        job_count: c.job_count?.toString() || '',
      }))
      // If no multi-country rows but project has a country, seed from legacy
      if (inputs.length === 0 && editProject.country_id && editProject.country) {
        inputs.push({ country_id: editProject.country_id, country_name: editProject.country, job_count: editProject.job_count?.toString() || '' })
      }
      setForm(f => ({ ...f, project_countries: inputs }))
    }).catch(() => {
      // Fall back to legacy single country
      if (editProject.country_id && editProject.country) {
        setForm(f => ({ ...f, project_countries: [{ country_id: editProject.country_id!, country_name: editProject.country!, job_count: editProject.job_count?.toString() || '' }] }))
      }
    })

    fetchProjectTasks(editProject.id).then(tasks => {
      const inputs: ProjectTaskInput[] = tasks.map(t => ({ id: t.id, title: t.title, description: t.description || '' }))
      setForm(f => ({ ...f, project_tasks: inputs }))
    }).catch(() => {})
  }, [editProject, lookups])

  // Recompute ETA when relevant fields change
  useEffect(() => {
    if (!predStats || !form.client_type_id || !form.industry_id) {
      setEta(null)
      return
    }
    const clientTypeName = lookups?.clientTypes.find(c => c.id === form.client_type_id)?.name
    const industryName = lookups?.industries.find(i => i.id === form.industry_id)?.name
    const countryName = form.project_countries.length > 0
      ? form.project_countries[0].country_name
      : lookups?.countries.find(c => c.id === form.country_id)?.name
    const jobCount = form.job_count ? parseInt(form.job_count) : undefined

    setEta(predictDeliveryTime(predStats, clientTypeName, industryName, countryName, jobCount))
  }, [predStats, form.client_type_id, form.industry_id, form.project_countries, form.country_id, form.job_count, lookups])

  const set = useCallback((field: keyof ProjectFormData, value: any) => {
    setForm(f => ({ ...f, [field]: value }))
    setTouched(t => ({ ...t, [field]: true }))
  }, [])

  // ── Validation ───────────────────────────────────────────────────────────────

  const errors: Record<string, string> = {}
  if (isAdmin && touched.project_owner && !form.project_owner) errors.project_owner = 'Required'
  if (touched.client_name && !form.client_name) errors.client_name = 'Required'
  if (touched.date_received && !form.date_received) errors.date_received = 'Required'
  if (touched.status_id && !form.status_id) errors.status_id = 'Required'

  // Non-admins always get 'Under Review' auto-set — don't gate the button on status_id for them
  const isValid = (isAdmin ? !!form.project_owner && !!form.status_id : true) && !!form.client_name && !!form.date_received

  // ── Template parse state ─────────────────────────────────────────────────────
  const [isParsing, setIsParsing] = useState(false)
  const [parseResult, setParseResult] = useState<{ warnings: string[]; fuzzyMatches: string[]; unmatchedCount: number; locationWarnings: string[] } | null>(null)
  const [qualityResult, setQualityResult] = useState<TemplateQualityResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const parseInputRef = useRef<HTMLInputElement>(null)
  const [templateFile, setTemplateFile] = useState<File | null>(null)

  // ── Country builder ──────────────────────────────────────────────────────────

  // ── Template file parser ──────────────────────────────────────────────────────
  const handleTemplateParse = async (file: File) => {
    if (!lookups) return
    setTemplateFile(file)
    setIsParsing(true)
    setParseResult(null)
    setQualityResult(null)
    try {
      const dbCountries: DBCountry[] = lookups.countries.map(c => ({ id: c.id, name: c.name }))
      const result = await parseTemplateFile(file, form.project_type || '', dbCountries)

      if (result.countries.length > 0 || result.totalJobs > 0) {
        // Build new project_countries list from parsed results
        const newCountries = result.countries
          .filter(pc => pc.resolvedId !== null)
          .map(pc => ({
            country_id: pc.resolvedId!,
            country_name: pc.resolvedName,
            job_count: pc.jobCount.toString(),
          }))

        // Merge with any existing countries (don't overwrite ones user already added)
        const existing = form.project_countries.filter(
          ec => !newCountries.some(nc => nc.country_id === ec.country_id)
        )
        setForm(f => ({
          ...f,
          project_countries: [...existing, ...newCountries],
          // Pre-fill total job count if not already set
          job_count: f.job_count || result.totalJobs.toString(),
        }))
      }

      const fuzzyMatches = result.countries
        .filter(pc => pc.confidence === 'fuzzy' || pc.confidence === 'alias')
        .map(pc => `"${pc.rawName}" → ${pc.resolvedName}`)

      setParseResult({
        warnings: result.parseWarnings,
        fuzzyMatches,
        unmatchedCount: result.unmatched.length,
        locationWarnings: result.locationWarnings,
      })
      // Fire quality analysis async — don't block the parse result display
      setIsAnalyzing(true)
      analyzeTemplateQuality(file, form.project_type || '')
        .then(qr => setQualityResult(qr))
        .catch(() => setQualityResult(null))
        .finally(() => setIsAnalyzing(false))
    } catch (err) {
      setParseResult({
        warnings: [`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`],
        fuzzyMatches: [],
        unmatchedCount: 0,
        locationWarnings: [],
      })
    } finally {
      setIsParsing(false)
      if (parseInputRef.current) parseInputRef.current.value = ''
    }
  }

  const addCountry = () => {
    if (!countryPickId) return
    const id = parseInt(countryPickId)
    if (form.project_countries.some(c => c.country_id === id)) return
    const country = lookups!.countries.find(c => c.id === id)
    if (!country) return
    setForm(f => ({
      ...f,
      project_countries: [...f.project_countries, { country_id: id, country_name: country.name, job_count: countryPickJobs }],
    }))
    setCountryPickId('')
    setCountryPickJobs('')
  }

  const removeCountry = (idx: number) => {
    setForm(f => ({ ...f, project_countries: f.project_countries.filter((_, i) => i !== idx) }))
  }

  const updateCountryJobs = (idx: number, jobs: string) => {
    setForm(f => ({
      ...f,
      project_countries: f.project_countries.map((c, i) => i === idx ? { ...c, job_count: jobs } : c),
    }))
  }

  // ── Task builder ─────────────────────────────────────────────────────────────

  const addTask = () => {
    if (!taskTitle.trim()) return
    setForm(f => ({ ...f, project_tasks: [...f.project_tasks, { title: taskTitle.trim(), description: taskDesc.trim() }] }))
    setTaskTitle('')
    setTaskDesc('')
  }

  const removeTask = (idx: number) => {
    setForm(f => ({ ...f, project_tasks: f.project_tasks.filter((_, i) => i !== idx) }))
  }

  const startEditTask = (idx: number) => {
    setEditingTaskIdx(idx)
    setEditTaskTitle(form.project_tasks[idx].title)
    setEditTaskDesc(form.project_tasks[idx].description)
  }

  const saveEditTask = () => {
    if (editingTaskIdx === null || !editTaskTitle.trim()) return
    setForm(f => ({
      ...f,
      project_tasks: f.project_tasks.map((t, i) =>
        i === editingTaskIdx ? { ...t, title: editTaskTitle.trim(), description: editTaskDesc.trim() } : t
      ),
    }))
    setEditingTaskIdx(null)
  }

  // ── File staging ─────────────────────────────────────────────────────────────

  const stageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(`"${file.name}" is ${formatFileSize(file.size)} — max 2 MB per file`)
      return
    }
    const totalSlots = stagedFiles.length + (editProject ? 0 : 0)
    if (totalSlots >= MAX_FILES_PER_PROJECT) {
      alert('Maximum 5 files per project')
      return
    }
    if (stagedFiles.some(f => f.name === file.name)) {
      alert('A file with that name is already staged')
      return
    }
    setStagedFiles(prev => [...prev, file])
  }

  const removeStagedFile = (idx: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  // ── Core submit logic (called directly or via modal proceed button) ──────────
  const doSubmit = async (resolvedForm: ProjectFormData, activeUser: any) => {
    setShowQualityWarning(false)
    setShowNoTemplateWarning(false)
    setSaving(true)
    setError(null)
    setUploadProgress(null)
    console.log('[SUBMIT] session OK — calling createProject...')

    try {
      let savedProject: Project

      if (editProject) {
        await updateProject(editProject.id, resolvedForm)
        savedProject = { ...editProject, ...form } as any
        // Upload any newly staged files
        if (stagedFiles.length > 0) {
          for (let i = 0; i < stagedFiles.length; i++) {
            setUploadProgress(`Uploading file ${i + 1} of ${stagedFiles.length}…`)
            await uploadProjectFile(editProject.id, stagedFiles[i], activeUser.id)
          }
        }
      } else {
        savedProject = await createProject(resolvedForm, activeUser.id, eta)
        // Upload staged files now that we have a project ID
        if (stagedFiles.length > 0) {
          for (let i = 0; i < stagedFiles.length; i++) {
            setUploadProgress(`Uploading file ${i + 1} of ${stagedFiles.length}…`)
            await uploadProjectFile(savedProject.id, stagedFiles[i], activeUser.id)
          }
        }
      }

      setUploadProgress(null)
      setSuccess(true)
      setTimeout(() => onSaved(savedProject), 800)
    } catch (err: any) {
      console.error('[SUBMIT] ERROR caught:', err)
      setError(err.message || 'Failed to save project')
      setUploadProgress(null)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[SUBMIT] handleSubmit fired, isValid=', isValid)
    if (!isValid) return
    // Use context user — App.tsx keeps session fresh via 2-min interval getSession() check
    const activeUser = user
    if (!activeUser) {
      setError('Your session has expired. Please refresh the page.')
      return
    }
    // For non-admins, ensure status_id is resolved at submit time (defensive)
    let resolvedForm = form
    if (!isAdmin && !form.status_id && lookups) {
      const underReview = lookups.statuses.find(s => s.name === 'Under Review')
      if (underReview) resolvedForm = { ...form, status_id: underReview.id }
    }
    // Store for modal proceed buttons
    pendingFormRef.current = resolvedForm
    pendingUserRef.current = activeUser
    // Template gate — new projects only
    if (!editProject && !templateFile) {
      setShowNoTemplateWarning(true)
      return
    }
    // Quality gate — new projects only, only when template was analysed
    if (!editProject && qualityResult && qualityResult.overallScore < PASSING_QUALITY_SCORE) {
      setShowQualityWarning(true)
      return
    }
    await doSubmit(resolvedForm, activeUser)
  }

  // ── Loading states ────────────────────────────────────────────────────────────

  if (!lookups && !error) return (
    <div className="flex items-center justify-center h-64">
      <span className="loading loading-spinner loading-md text-primary"></span>
    </div>
  )
  if (!lookups && error) return (
    <div className="flex items-center justify-center h-64">
      <div className="alert alert-error max-w-md"><span>{error}</span></div>
    </div>
  )

  const availableCountries = lookups!.countries.filter(
    c => !form.project_countries.some(pc => pc.country_id === c.id)
  )
  const totalJobsFromCountries = form.project_countries.reduce(
    (sum, c) => sum + (c.job_count ? parseInt(c.job_count) || 0 : 0), 0
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-base-content">
            {editProject ? 'Edit Project' : 'New Project'}
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">
            {editProject ? `Editing: ${editProject.client_name}` : 'Create a new delivery tracking entry'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      </div>

      {success && (
        <div className="alert alert-success mb-4 animate-pulse">
          <CheckCircle2 size={18} />
          <span>Project {editProject ? 'updated' : 'created'} successfully!</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error mb-4">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {uploadProgress && (
        <div className="alert alert-info mb-4">
          <span className="loading loading-spinner loading-xs"></span>
          <span>{uploadProgress}</span>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate data-tour="new-project-form">
        <div className="flex flex-col gap-5">

          {/* ── Card 1: People ─────────────────────────────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-4">
              <Section icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} title="People">
                {isAdmin ? (
                  /* Admin: full editable People fields */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Project Owner" required error={errors.project_owner}>
                      <input
                        className={`input input-bordered w-full ${errors.project_owner ? 'input-error' : ''}`}
                        value={form.project_owner}
                        onChange={e => set('project_owner', e.target.value)}
                        onBlur={() => setTouched(t => ({ ...t, project_owner: true }))}
                        placeholder="e.g. Jane Smith"
                      />
                    </Field>
                    <Field label="Analyst" hint="Select from list">
                      <select
                        className="select select-bordered w-full"
                        value={form.analyst}
                        onChange={e => set('analyst', e.target.value)}
                      >
                        <option value="">— Select analyst —</option>
                        {analysts.map(a => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Requestor">
                      <input
                        className="input input-bordered w-full"
                        value={form.requestor}
                        onChange={e => set('requestor', e.target.value)}
                        placeholder="e.g. HR Manager"
                      />
                    </Field>
                  </div>
                ) : (
                  /* Normal user: Requestor auto-set (read-only), Owner & Analyst assigned by admin */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Submitted By (Requestor)">
                        <div className="input input-bordered w-full bg-base-300/50 flex items-center text-sm text-base-content/70 cursor-not-allowed">
                          {form.requestor || profile?.full_name || user?.email || '—'}
                        </div>
                      </Field>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-info/10 border border-info/20 text-info text-xs">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span><strong>Project Owner</strong> and <strong>Analyst</strong> will be assigned by an Admin after submission.</span>
                    </div>
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* ── Card 2: Client & Project Type ──────────────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-4">
              <Section icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>} title="Client">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Client Name" required error={errors.client_name}>
                    <div className="relative">
                      {/* Combobox input */}
                      <input
                        className={`input input-bordered w-full ${errors.client_name ? 'input-error' : ''}`}
                        value={clientSearch || form.client_name}
                        onChange={e => {
                          const v = e.target.value
                          setClientSearch(v)
                          setClientDropOpen(true)
                          setClientRequestMode(false)
                          setClientRequestDone(false)
                          if (!v) set('client_name', '')
                        }}
                        onFocus={() => setClientDropOpen(true)}
                        onBlur={() => setTimeout(() => setClientDropOpen(false), 150)}
                        placeholder="Search or type client name…"
                        autoComplete="off"
                      />
                      {/* Dropdown */}
                      {clientDropOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                          {(() => {
                            const q = (clientSearch || '').toLowerCase()
                            const allFiltered = clients.filter(c => c.name.toLowerCase().includes(q))
                            const CAP = 50
                            const filtered = allFiltered.slice(0, CAP)
                            const hasMore = allFiltered.length > CAP
                            return (
                              <>
                                {clients.length === 0 && (
                                  <div className="px-3 py-2 text-xs text-base-content/40">No clients loaded yet</div>
                                )}
                                {clients.length > 0 && !q && (
                                  <div className="px-3 py-2 text-xs text-base-content/40 italic">Type to search {clients.length} clients…</div>
                                )}
                                {filtered.map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 flex items-center justify-between gap-2"
                                    onMouseDown={() => {
                                      set('client_name', c.name)
                                      setClientSearch('')
                                      setClientDropOpen(false)
                                      setClientRequestMode(false)
                                    }}
                                  >
                                    <span>{c.name}</span>
                                    {c.external_id && <span className="text-xs text-base-content/40 shrink-0">{c.external_id}</span>}
                                  </button>
                                ))}
                                                          {hasMore && (
                                  <div className="px-3 py-2 text-xs text-base-content/40 italic">
                                    {allFiltered.length - CAP} more — type to narrow results
                                  </div>
                                )}
      {/* Request to add option */}
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/10 border-t border-base-300 flex items-center gap-2"
                                  onMouseDown={() => {
                                    setClientRequestMode(true)
                                    setClientRequestName(clientSearch)
                                    setClientDropOpen(false)
                                  }}
                                >
                                  <span>➕</span>
                                  <span>Can't find your client? <strong>Request to add</strong>{clientSearch ? ` "${clientSearch}"` : ''}</span>
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Selected client display */}
                    {form.client_name && !clientDropOpen && !clientRequestMode && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="badge badge-success badge-sm gap-1">✓ {form.client_name}</span>
                        <button type="button" className="text-xs text-base-content/40 hover:text-error" onClick={() => { set('client_name', ''); setClientSearch('') }}>change</button>
                      </div>
                    )}

                    {/* Request to add flow */}
                    {clientRequestMode && !clientRequestDone && (
                      <div className="mt-2 p-3 rounded-lg bg-info/10 border border-info/30 space-y-2">
                        <p className="text-xs font-semibold text-info">Request to add a new client</p>
                        <input
                          className="input input-bordered input-sm w-full"
                          placeholder="Client name to request…"
                          value={clientRequestName}
                          onChange={e => setClientRequestName(e.target.value)}
                        />
                        <p className="text-xs text-base-content/50">An admin will review and approve your request. You can continue filling out this form — your project will use this name once approved.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-info btn-xs"
                            disabled={!clientRequestName.trim() || clientRequestSubmitting || !user}
                            onClick={async () => {
                              if (!clientRequestName.trim() || !user) return
                              setClientRequestSubmitting(true)
                              try {
                                await submitClientRequest(clientRequestName.trim(), user.id)
                                set('client_name', clientRequestName.trim())
                                setClientRequestDone(true)
                                setClientRequestMode(false)
                              } catch { /* ignore */ } finally {
                                setClientRequestSubmitting(false)
                              }
                            }}
                          >
                            {clientRequestSubmitting ? <span className="loading loading-spinner loading-xs" /> : 'Submit Request'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setClientRequestMode(false); setClientRequestName('') }}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Request submitted confirmation */}
                    {clientRequestDone && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="badge badge-info badge-sm gap-1">⏳ Pending: {form.client_name}</span>
                        <span className="text-xs text-base-content/40">request submitted — you can continue</span>
                      </div>
                    )}
                  </Field>
                  <Field label="Client Type">
                    <select
                      className="select select-bordered w-full"
                      value={form.client_type_id ?? ''}
                      onChange={e => set('client_type_id', e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">— Select client type —</option>
                      {lookups!.clientTypes.map(ct => (
                        <option key={ct.id} value={ct.id}>{ct.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Industry">
                    <select
                      className="select select-bordered w-full"
                      value={form.industry_id ?? ''}
                      onChange={e => set('industry_id', e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">— Select industry —</option>
                      {lookups!.industries.map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </Field>

                  {/* Project Type with template download */}
                  <div data-tour="project-type-field">
                    <Field label="Project Type" hint="Download template below">
                      <select
                        className="select select-bordered w-full"
                        value={form.project_type ?? ''}
                        onChange={e => set('project_type', e.target.value || null)}
                      >
                        <option value="">— Select project type —</option>
                        {projectTypes.map(pt => (
                          <option key={pt.id} value={pt.name}>{pt.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>

                {/* Template download strip */}
                {form.project_type && (() => {
                  const pt = projectTypes.find(p => p.name === form.project_type)
                  return pt?.template_url ? (
                    <div data-tour="template-download-strip">
                      <a
                        href={pt.template_url}
                        download={pt.template_label || pt.name}
                        className="btn btn-ghost btn-sm gap-1.5 text-primary border border-primary/30 hover:bg-primary/10"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={14} />
                        <span>Download {pt.template_label || `${pt.name} Template`}</span>
                      </a>
                    </div>
                  ) : null
                })()}
              </Section>
            </div>
          </div>

          {/* ── Card 3: Countries ──────────────────────────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-4">
              <Section icon={<Globe size={16} />} title="Countries & Job Counts">
                {/* ── Parse from template ── */}
                <div className="mb-3 p-3 bg-base-200 rounded-lg border border-base-300" data-tour="ai-quality-review">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">📊</span>
                      <div>
                        <p className="text-sm font-semibold text-base-content">Auto-fill from template file</p>
                        <p className="text-xs text-base-content/60">Upload a filled-in Rate Card, Right Sourcing, or Magnit VMS file to auto-populate countries &amp; job counts</p>
                      </div>
                    </div>
                    <input
                      ref={parseInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) handleTemplateParse(f)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => parseInputRef.current?.click()}
                      disabled={isParsing}
                      className="btn btn-sm btn-outline btn-primary shrink-0"
                    >
                      {isParsing ? (
                        <><span className="loading loading-spinner loading-xs" /> Parsing…</>
                      ) : (
                        <><span>📂</span> Choose File</>
                      )}
                    </button>
                  </div>

                  {/* Parse result feedback */}
                  {parseResult && (
                    <div className="mt-2 space-y-1">
                      {parseResult.warnings.map((w, i) => (
                        <div key={i} className="alert alert-warning py-1 px-3 text-xs">{w}</div>
                      ))}
                      {parseResult.fuzzyMatches.length > 0 && (
                        <div className="alert alert-info py-1 px-3 text-xs">
                          <span className="font-semibold">Auto-corrected:</span>{' '}
                          {parseResult.fuzzyMatches.join(' · ')}
                        </div>
                      )}
                      {parseResult.unmatchedCount > 0 && (
                        <div className="alert alert-warning py-1 px-3 text-xs">
                          ⚠️ {parseResult.unmatchedCount} country name(s) could not be matched — please add them manually below.
                        </div>
                      )}
                      {parseResult.warnings.length === 0 && parseResult.unmatchedCount === 0 && parseResult.locationWarnings.length === 0 && (
                        <div className="alert alert-success py-1 px-3 text-xs">
                          ✅ Countries and job counts pre-filled from your file. Review below and adjust as needed.
                        </div>
                      )}
                    </div>
                  )}
                  {/* AI Quality Review Panel */}
                  <div>
                    <TemplateQualityReview result={qualityResult} isLoading={isAnalyzing} locationValidationWarnings={parseResult?.locationWarnings ?? []} passingScore={PASSING_QUALITY_SCORE} originalFile={templateFile} />
                  </div>
                </div>

                {/* Country picker row */}
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="select select-bordered flex-1 min-w-[180px]"
                    value={countryPickId}
                    onChange={e => setCountryPickId(e.target.value)}
                  >
                    <option value="">— Add a country —</option>
                    {availableCountries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="input input-bordered w-32"
                    placeholder="Jobs (opt)"
                    value={countryPickJobs}
                    onChange={e => setCountryPickJobs(e.target.value)}
                    min="0"
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1 self-end mb-0.5"
                    onClick={addCountry}
                    disabled={!countryPickId}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                {/* Selected countries list */}
                {form.project_countries.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {/* Header row */}
                    <div className="flex items-center justify-between px-3 py-1">
                      <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
                        {form.project_countries.length} {form.project_countries.length === 1 ? 'country' : 'countries'}
                      </span>
                      {totalJobsFromCountries > 0 && (
                        <span className="text-xs text-base-content/50">
                          Total: <strong>{totalJobsFromCountries.toLocaleString()}</strong> jobs
                        </span>
                      )}
                    </div>

                    {/* Scrollable list — capped at ~8 rows (~320px), scrolls for 9+ */}
                    <div
                      className="flex flex-col gap-1.5 overflow-y-auto pr-1"
                      style={{ maxHeight: form.project_countries.length > 8 ? '320px' : undefined }}
                    >
                      {form.project_countries.map((c, idx) => (
                        <div key={c.country_id} className="flex items-center gap-3 px-3 py-2 bg-base-100 border border-base-300 rounded-lg">
                          <span className="text-xs text-base-content/40 w-5 text-right shrink-0">{idx + 1}</span>
                          <span className="flex-1 font-medium text-sm truncate">{c.country_name}</span>
                          <input
                            type="number"
                            className="input input-bordered input-sm w-24 text-sm"
                            placeholder="# jobs"
                            value={c.job_count}
                            onChange={e => updateCountryJobs(idx, e.target.value)}
                            min="0"
                          />
                          <span className="text-xs text-base-content/40 shrink-0">jobs</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error hover:bg-error/10 shrink-0"
                            onClick={() => removeCountry(idx)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {form.project_countries.length === 0 && (
                  <p className="text-xs text-base-content/40 mt-1">No countries added yet — add at least one above.</p>
                )}
              </Section>
            </div>
          </div>

          {/* ── Card 4: Project Details & Dates ───────────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-5">
              <Section icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} title="Project Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Status" required={isAdmin} error={isAdmin ? errors.status_id : undefined}>
                    {isAdmin ? (
                      <select
                        className={`select select-bordered w-full ${errors.status_id ? 'select-error' : ''}`}
                        value={form.status_id ?? ''}
                        onChange={e => set('status_id', e.target.value ? parseInt(e.target.value) : null)}
                        onBlur={() => setTouched(t => ({ ...t, status_id: true }))}
                      >
                        <option value="">— Select status —</option>
                        {lookups!.statuses.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="input input-bordered w-full bg-base-300/50 flex items-center text-sm text-base-content/70 cursor-not-allowed">
                        {lookups!.statuses.find(s => s.id === form.status_id)?.name || 'Under Review'}
                      </div>
                    )}
                  </Field>
                  <Field label="Total Job Count" hint={form.project_countries.length > 0 ? `${totalJobsFromCountries} from countries` : undefined}>
                    <input
                      type="number"
                      className="input input-bordered w-full"
                      value={form.job_count}
                      onChange={e => set('job_count', e.target.value)}
                      placeholder={totalJobsFromCountries > 0 ? totalJobsFromCountries.toString() : 'e.g. 150'}
                      min="0"
                    />
                  </Field>
                  {/* Time Allocation */}
                  <Field label="Time Allocation (hrs)" hint={!isAdmin ? 'Admin only' : undefined}>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className={`input input-bordered w-full ${!isAdmin ? 'bg-base-300/50 cursor-not-allowed text-base-content/40' : ''}`}
                      placeholder="e.g. 2.5"
                      value={form.time_allocation}
                      disabled={!isAdmin}
                      onChange={e => { if (isAdmin) setForm(prev => ({ ...prev, time_allocation: e.target.value })) }}
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Project Summary">
                    <textarea
                      className="textarea textarea-bordered w-full h-24 resize-none"
                      value={form.project_summary}
                      onChange={e => set('project_summary', e.target.value)}
                      placeholder="Describe the project scope, requirements, or notes…"
                    />
                  </Field>
                </div>
              </Section>

              <div className="divider my-0 opacity-40"></div>

              <Section icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} title="Dates">
                {isAdmin ? (
                  /* Admin: all 3 date fields editable */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Date Received" required error={errors.date_received}>
                      <input
                        type="date"
                        className={`input input-bordered w-full ${errors.date_received ? 'input-error' : ''}`}
                        value={form.date_received}
                        onChange={e => set('date_received', e.target.value)}
                        onBlur={() => setTouched(t => ({ ...t, date_received: true }))}
                      />
                    </Field>
                    <Field label="Expected Delivery">
                      <input
                        type="date"
                        className="input input-bordered w-full"
                        value={form.expected_delivery_date}
                        onChange={e => set('expected_delivery_date', e.target.value)}
                      />
                    </Field>
                    <Field label="Date Delivered">
                      <input
                        type="date"
                        className="input input-bordered w-full"
                        value={form.date_delivered}
                        onChange={e => set('date_delivered', e.target.value)}
                      />
                    </Field>
                  </div>
                ) : (
                  /* Normal user: Date Received locked to today; Date Delivered hidden */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Date Received" hint="Auto-set to today">
                      <div className="input input-bordered w-full bg-base-300/50 flex items-center text-sm text-base-content/70 cursor-not-allowed">
                        {form.date_received || new Date().toISOString().slice(0, 10)}
                      </div>
                    </Field>
                    <Field label="Expected Delivery">
                      <input
                        type="date"
                        className="input input-bordered w-full"
                        value={form.expected_delivery_date}
                        onChange={e => set('expected_delivery_date', e.target.value)}
                      />
                    </Field>
                  </div>
                )}
              </Section>
            </div>
          </div>

          {/* ── Card 5: Additional Requests (Tasks) ─────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-4">
              <Section icon={<ListTodo size={16} />} title="Additional Requests">
                {/* Add task row */}
                <div className="flex gap-2 flex-wrap">
                  <input
                    className="input input-bordered flex-1 min-w-[200px]"
                    placeholder="e.g. PDF version of delivery, CC: Jane Smith on delivery…"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask() } }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1 self-end mb-0.5"
                    onClick={addTask}
                    disabled={!taskTitle.trim()}
                  >
                    <Plus size={14} /> Add Request
                  </button>
                </div>

                {/* Optional description for new task */}
                {taskTitle && (
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="Additional details (optional)…"
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                  />
                )}

                {/* Task list */}
                {form.project_tasks.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {form.project_tasks.map((task, idx) => (
                      <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-base-100 border border-base-300 rounded-lg">
                        {editingTaskIdx === idx ? (
                          <div className="flex-1 flex flex-col gap-2">
                            <input
                              className="input input-bordered input-sm w-full"
                              value={editTaskTitle}
                              onChange={e => setEditTaskTitle(e.target.value)}
                              autoFocus
                            />
                            <input
                              className="input input-bordered input-sm w-full"
                              placeholder="Details (optional)…"
                              value={editTaskDesc}
                              onChange={e => setEditTaskDesc(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button type="button" className="btn btn-success btn-xs gap-1" onClick={saveEditTask}>
                                <Check size={12} /> Save
                              </button>
                              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditingTaskIdx(null)}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{task.title}</p>
                              {task.description && <p className="text-xs text-base-content/50 mt-0.5">{task.description}</p>}
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-primary hover:bg-primary/10"
                              onClick={() => startEditTask(idx)}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                              onClick={() => removeTask(idx)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {form.project_tasks.length === 0 && (
                  <p className="text-xs text-base-content/40 mt-1">
                    No requests added yet. Examples: "PDF version", "Include Excel export", "CC: John Smith on delivery"
                  </p>
                )}
              </Section>
            </div>
          </div>

          {/* ── Card 6: File Attachments ──────────────────────────────────── */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body gap-4">
              <Section icon={<Paperclip size={16} />} title="File Attachments">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-base-content/50">
                    Attach templates, requirements, or reference files · max 2 MB each · up to {MAX_FILES_PER_PROJECT} files
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={stagedFiles.length >= MAX_FILES_PER_PROJECT}
                  >
                    <Paperclip size={13} />
                    {stagedFiles.length >= MAX_FILES_PER_PROJECT ? 'File limit reached' : 'Attach File'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={stageFile}
                  />
                </div>

                {stagedFiles.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {stagedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-base-100 border border-base-300 rounded-lg">
                        <FileText size={15} className="text-primary/60 shrink-0" />
                        <span className="flex-1 text-sm font-medium truncate">{file.name}</span>
                        <span className="text-xs text-base-content/40">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                          onClick={() => removeStagedFile(idx)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-base-content/40">
                      {stagedFiles.length}/{MAX_FILES_PER_PROJECT} files staged — will upload when you save
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-base-content/40">No files attached</p>
                )}
              </Section>
            </div>
          </div>

          {/* ── AI ETA Card ───────────────────────────────────────────────── */}
          {eta && !editProject && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={15} className="text-primary/70" />
                  <span className="text-sm font-semibold text-base-content/60 uppercase tracking-wider">AI Delivery Estimate</span>
                </div>
                <ETABadge {...eta} />
                <p className="text-xs text-base-content/40 mt-2">
                  Based on {predStats?.overall.count ?? 0} completed projects. This is an estimate — actual delivery time may vary.
                </p>
              </div>
            </div>
          )}

        </div>{/* end flex col */}


        <div className="flex justify-end gap-3 mt-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            data-tour="submit-project"
            className={`btn btn-primary gap-2 ${saving ? 'loading' : ''}`}
            disabled={!isValid || saving || success}
          >
            {!saving && <Save size={16} />}
            {saving
              ? (uploadProgress ? 'Uploading…' : 'Saving…')
              : editProject ? 'Update Project' : 'Create Project'}
          </button>
        </div>

      {/* ── No Template Warning Modal ───────────────────────────────────── */}
      {showNoTemplateWarning && (
        <div className="modal modal-open" style={{zIndex: 9999}}>
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="text-warning text-xl">⚠️</span>
              Submit without a template?
            </h3>
            <p className="text-sm text-base-content/80 font-medium mt-4">Projects submitted without a template may result in:</p>
            <ul className="list-disc list-inside text-sm text-base-content/70 mt-2 space-y-1">
              <li>Project placed on hold pending template upload</li>
              <li>Requests for rework or clarification from the review team</li>
              <li>Project rejection due to missing data</li>
            </ul>
            <p className="text-sm font-semibold text-warning mt-4">
              By proceeding, you acknowledge and accept these risks.
            </p>
            <div className="modal-action mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm transition-colors"
                onClick={() => setShowNoTemplateWarning(false)}
              >
                Upload Template
              </button>
              <button
                type="button"
                className="btn btn-warning gap-2"
                onClick={() => { if (pendingFormRef.current && pendingUserRef.current) doSubmit(pendingFormRef.current, pendingUserRef.current) }}
              >
                I understand — submit anyway
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/40" onClick={() => setShowNoTemplateWarning(false)} />
        </div>
      )}

      {/* ── Low Quality Score Warning Modal ──────────────────────────────── */}
      {showQualityWarning && (
        <div className="modal modal-open" style={{zIndex: 9999}}>
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="text-warning text-xl">⚠️</span>
              Submit with quality issues?
            </h3>
            <p className="py-4 text-sm text-base-content/80">
              Your template quality score is{' '}
              <strong className="text-warning">{qualityResult?.overallScore ?? 0}/{PASSING_QUALITY_SCORE}</strong>,
              which is below the required passing threshold.
            </p>
            <p className="text-sm text-base-content/80 font-medium">Submitting with unresolved issues may result in:</p>
            <ul className="list-disc list-inside text-sm text-base-content/70 mt-2 space-y-1">
              <li>Project processing delays</li>
              <li>Requests for rework or clarification from the review team</li>
              <li>Project rejection due to unresolved data issues</li>
            </ul>
            <p className="text-sm font-semibold text-warning mt-4">
              By proceeding, you acknowledge and accept these risks.
            </p>
            <div className="modal-action mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 font-medium text-sm transition-colors"
                onClick={() => setShowQualityWarning(false)}
              >
                Cancel — fix issues first
              </button>
              <button
                type="button"
                className="btn btn-warning gap-2"
                onClick={() => { if (pendingFormRef.current && pendingUserRef.current) doSubmit(pendingFormRef.current, pendingUserRef.current) }}
              >
                I understand — submit anyway
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/40" onClick={() => setShowQualityWarning(false)} />
        </div>
      )}

      </form>
    </div>
  )
}
