import { getAuthHeaders } from './supabase'
import DOMPurify from 'dompurify'

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || ''

// ─── Generic API helper ────────────────────────────────────────────────────────
async function api<T = any>(
  path: string,
  options: { method?: string; body?: any; query?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'GET', body, query } = options
  const headers = await getAuthHeaders()
  let url = `${API_BASE}/api/${path}`
  if (query) {
    const qs = new URLSearchParams(query).toString()
    if (qs) url += `?${qs}`
  }
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── S3 storage helpers ─────────────────────────────────────────────────────
async function s3UploadFile(
  bucket: string,
  storagePath: string,
  file: File
): Promise<void> {
  const key = `${bucket}/${storagePath}`
  const contentType = file.type || 'application/octet-stream'
  const headers = await getAuthHeaders()
  const urlRes = await fetch(`${API_BASE}/api/storage/upload-url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType }),
  })
  if (!urlRes.ok) throw new Error(`Could not get upload URL: ${await urlRes.text().catch(() => urlRes.statusText)}`)
  const { uploadUrl } = await urlRes.json()
  const fileBlob = new Blob([await file.arrayBuffer()], { type: contentType })
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBlob,
  })
  if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.statusText}`)
}

async function s3DeleteFile(bucket: string, storagePath: string): Promise<void> {
  const key = `${bucket}/${storagePath}`
  const headers = await getAuthHeaders()
  await fetch(`${API_BASE}/api/storage/object`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => {})
}

async function s3DeleteFiles(bucket: string, storagePaths: string[]): Promise<void> {
  if (!storagePaths.length) return
  const keys = storagePaths.map(p => `${bucket}/${p}`)
  const headers = await getAuthHeaders()
  await fetch(`${API_BASE}/api/storage/object`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  }).catch(() => {})
}

async function s3GetSignedUrl(bucket: string, storagePath: string): Promise<string> {
  const key = `${bucket}/${storagePath}`
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/storage/download-url?key=${encodeURIComponent(key)}`, { headers })
  if (!res.ok) throw new Error('Could not generate download link')
  const { downloadUrl } = await res.json()
  return downloadUrl
}

// ─── Input sanitization ───────────────────────────────────────────────────────
//
// Strip ALL HTML — the function is meant to produce plain-text values for
// fields that should never contain markup. Uses DOMPurify with empty tag/attr
// allowlists, which handles malformed HTML, attribute-based XSS, and the
// various URL-attribute attack vectors that the old regex (/<[^>]*>/g) missed.
// See audit C-3.
function sanitizeText(val: string | null | undefined): string | null {
  if (val == null || val === '') return null
  const cleaned = DOMPurify.sanitize(String(val), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
  return cleaned || null
}

import type {
  Project, KPIData, StatusCount, OwnerCount, FilterState, SortState,
  LookupItem, ProjectFeedback, ProjectFeedbackItem, ProjectFormData, ProjectCountry, ProjectCountryInput, ProjectTask,
  ProjectETAHistory,
  NotificationType, AppNotification} from '../types'

// ─── Projects ─────────────────────────────────────────────────────────────────

export type LookupMaps = {
  statusMap: Map<number, string>
  clientTypeMap: Map<number, string>
  countryMap: Map<number, string>
  industryMap: Map<number, string>
}

export function buildLookupMaps(lookups: {
  statuses: LookupItem[]
  clientTypes: LookupItem[]
  countries: LookupItem[]
  industries: LookupItem[]
}): LookupMaps {
  return {
    statusMap: new Map(lookups.statuses.map(l => [l.id, l.name])),
    clientTypeMap: new Map(lookups.clientTypes.map(l => [l.id, l.name])),
    countryMap: new Map(lookups.countries.map(l => [l.id, l.name])),
    industryMap: new Map(lookups.industries.map(l => [l.id, l.name])),
  }
}

function mapRow(row: any, lookupMaps?: LookupMaps): Project {
  return {
    id: row.id,
    project_owner: row.project_owner,
    analyst: row.analyst,
    client_name: row.client_name,
    requestor: row.requestor,
    date_received: row.date_received,
    expected_delivery_date: row.expected_delivery_date,
    date_delivered: row.date_delivered,
    project_summary: row.project_summary,
    job_count: row.job_count,
    days_to_complete: row.days_to_complete,
    status: lookupMaps?.statusMap.get(row.status_id) || 'Unknown',
    status_id: row.status_id,
    client_type: lookupMaps?.clientTypeMap.get(row.client_type_id) || null,
    client_type_id: row.client_type_id,
    country: lookupMaps?.countryMap.get(row.country_id) || null,
    country_id: row.country_id,
    industry: lookupMaps?.industryMap.get(row.industry_id) || null,
    industry_id: row.industry_id,
    project_type: row.project_type || null,
    id_number: row.id_number ?? null,
    time_allocation: row.time_allocation ?? null,
    notifications_enabled: row.notifications_enabled ?? true,
    created_by: row.created_by,
    created_at: row.created_at,
    ai_eta_days: row.ai_eta_days ?? null,
    ai_eta_confidence: row.ai_eta_confidence ?? null,
    ai_eta_breakdown: row.ai_eta_breakdown ?? null,
    ai_eta_override_days: row.ai_eta_override_days ?? null,
    ai_eta_override_by: row.ai_eta_override_by ?? null,
    ai_eta_override_at: row.ai_eta_override_at ?? null,
    ai_eta_override_reason: row.ai_eta_override_reason ?? null,
  }
}

// ─── fetchProjects — parallel pagination via Lambda (no Supabase, no 1000-row cap) ───
// Aurora has no PostgREST 1000-row limit. Lambda handles direct pg queries.
// Pattern: get count → fire all pages in parallel (Promise.all) → flatten.
export async function fetchProjects(lookupMaps?: LookupMaps): Promise<Project[]> {
  const PAGE_SIZE = 2000

  // Step 1: Get total row count
  const countRes = await api<{ count: number }>('projects', { query: { count_only: 'true' } })
  const totalRows = Number(countRes.count ?? 0)
  if (totalRows === 0) return []

  const totalPages = Math.ceil(totalRows / PAGE_SIZE)

  // Step 2: Fire all pages in parallel
  const pages = await Promise.all(
    Array.from({ length: totalPages }, (_, i) =>
      api<any[]>('projects', {
        query: { limit: String(PAGE_SIZE), offset: String(i * PAGE_SIZE) },
      })
    )
  )

  return pages.flat().map((row: any) => mapRow(row, lookupMaps))
}

export async function fetchLookups(): Promise<{
  statuses: LookupItem[]
  clientTypes: LookupItem[]
  industries: LookupItem[]
  countries: LookupItem[]
}> {
  return api('lookups')
}

export async function createProject(
  form: ProjectFormData,
  _userId: string,
  eta?: { estimate: number; confidence: string; breakdown: string } | null
): Promise<Project> {
  const body: any = {
    project_owner: sanitizeText(form.project_owner) ?? form.project_owner,
    analyst: sanitizeText(form.analyst),
    client_type_id: form.client_type_id,
    client_name: sanitizeText(form.client_name) ?? form.client_name,
    requestor: sanitizeText(form.requestor),
    date_received: form.date_received,
    expected_delivery_date: form.expected_delivery_date || null,
    date_delivered: form.date_delivered || null,
    project_summary: sanitizeText(form.project_summary),
    job_count: form.job_count || null,
    status_id: form.status_id,
    country_id: form.country_id,
    industry_id: form.industry_id,
    project_type: form.project_type || null,
    time_allocation: form.time_allocation || null,
    project_countries: form.project_countries,
    project_tasks: form.project_tasks,
    ai_eta_days: eta?.estimate ?? null,
    ai_eta_confidence: eta?.confidence ?? null,
    ai_eta_breakdown: eta?.breakdown ?? null,
  }
  const row = await api<any>('projects', { method: 'POST', body })
  return mapRow(row)
}

export async function updateProject(id: string, form: ProjectFormData): Promise<void> {
  const body: any = {
    project_owner: sanitizeText(form.project_owner) ?? form.project_owner,
    analyst: sanitizeText(form.analyst),
    client_type_id: form.client_type_id,
    client_name: sanitizeText(form.client_name) ?? form.client_name,
    requestor: sanitizeText(form.requestor),
    date_received: form.date_received,
    expected_delivery_date: form.expected_delivery_date || null,
    date_delivered: form.date_delivered || null,
    project_summary: sanitizeText(form.project_summary),
    job_count: form.job_count || null,
    status_id: form.status_id,
    country_id: form.country_id,
    industry_id: form.industry_id,
    project_type: form.project_type || null,
    time_allocation: form.time_allocation ?? null,
    project_countries: form.project_countries,
    project_tasks: form.project_tasks,
  }
  await api(`projects/${id}`, { method: 'PATCH', body })
}

export async function updateProjectStatus(
  id: string,
  statusId: number,
  dateReceived: string | null,
  markDelivered: boolean
): Promise<{ date_delivered: string | null; days_to_complete: number | null }> {
  return api(`projects/${id}/status`, {
    method: 'PATCH',
    body: { status_id: statusId, mark_delivered: markDelivered, date_received: dateReceived },
  })
}

export async function bulkUpdateProjectStatus(ids: string[], statusId: number): Promise<void> {
  if (ids.length === 0) return
  await api('projects/bulk-status', { method: 'POST', body: { ids, status_id: statusId } })
}

// ─── Project Countries ─────────────────────────────────────────────────────────

export async function fetchProjectCountries(projectId: string): Promise<ProjectCountry[]> {
  return api<ProjectCountry[]>(`projects/${projectId}/countries`).catch(() => [])
}

export async function fetchAllProjectCountries(): Promise<Map<string, string[]>> {
  const rows = await api<Array<{ project_id: string; country_name: string }>>('projects/countries').catch(() => [])
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.country_name) continue
    const existing = map.get(row.project_id) || []
    existing.push(row.country_name)
    map.set(row.project_id, existing)
  }
  return map
}

export async function syncProjectCountries(
  projectId: string,
  entries: ProjectCountryInput[]
): Promise<void> {
  await api(`projects/${projectId}/countries/sync`, { method: 'POST', body: { entries } })
}

// ─── Project Tasks ─────────────────────────────────────────────────────────────

export async function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  return api<ProjectTask[]>(`projects/${projectId}/tasks`).catch(() => [])
}

export async function syncProjectTasks(
  projectId: string,
  tasks: Array<{ id?: string; title: string; description: string }>,
  _userId?: string
): Promise<void> {
  await api(`projects/${projectId}/tasks/sync`, { method: 'POST', body: { tasks } })
}

// ─── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  project_id: string
  user_id: string | null
  user_name: string | null
  action: string
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export async function fetchProjectHistory(projectId: string): Promise<AuditEntry[]> {
  return api<AuditEntry[]>(`projects/${projectId}/history`).catch(() => [])
}

// ─── CSV Import ────────────────────────────────────────────────────────────────

export async function importProjectsBatch(
  rows: ProjectFormData[],
  _userId: string
): Promise<{ success: number; errors: string[] }> {
  return api('projects/import', { method: 'POST', body: { rows } })
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export function fetchStatusCounts(projects: Project[]): StatusCount[] {
  const map: Record<string, number> = {}
  projects.forEach(p => { map[p.status] = (map[p.status] || 0) + 1 })
  return Object.entries(map)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}

export function fetchOwnerCounts(projects: Project[], excludeOwners: Set<string> = new Set()): OwnerCount[] {
  const map: Record<string, OwnerCount> = {}
  projects.forEach(p => {
    if (!p.project_owner) return
    if (excludeOwners.has(p.project_owner)) return
    if (!map[p.project_owner]) {
      map[p.project_owner] = { project_owner: p.project_owner, count: 0, completed: 0, active: 0 }
    }
    map[p.project_owner].count++
    if (p.status === 'Completed') map[p.project_owner].completed++
    else if (!['Completed', 'Cancelled'].includes(p.status)) map[p.project_owner].active++
  })
  return Object.values(map).sort((a, b) => b.count - a.count)
}

export async function fetchFilterOptions(_projects: Project[]) {
  const opts = await api<{
    clientTypes: string[]
    industries: string[]
    countries: string[]
    statuses: string[]
    analysts: string[]
  }>('filter-options')
  return { ...opts, owners: [] as string[] }
}

export function computeKPIs(projects: Project[]): KPIData {
  const completed = projects.filter(p => p.status === 'Completed')
  const active = projects.filter(p => !['Completed', 'Cancelled'].includes(p.status))
  const cancelled = projects.filter(p => p.status === 'Cancelled')
  const onHold = projects.filter(p => p.status === 'On Hold')
  const withDays = completed.filter(p => p.days_to_complete != null && p.days_to_complete > 0)
  const avgDays = withDays.length > 0
    ? Math.round(withDays.reduce((s, p) => s + (p.days_to_complete || 0), 0) / withDays.length)
    : 0
  const today = new Date().toISOString().slice(0, 10)
  const overdue = active.filter(p => p.expected_delivery_date && p.expected_delivery_date < today)
  const totalJobs = projects.reduce((s, p) => s + (p.job_count || 0), 0)
  const completionRate = projects.length > 0 ? Math.round((completed.length / projects.length) * 100) : 0

  const now = new Date()
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const deliveredThisMonth = projects.filter(p =>
    p.date_delivered && p.date_delivered.startsWith(thisMonthStr)
  ).length

  return {
    total: projects.length, active: active.length, completed: completed.length,
    cancelled: cancelled.length, onHold: onHold.length,
    avgDaysToComplete: avgDays, overdue: overdue.length,
    totalJobs, completionRate, deliveredThisMonth,
  }
}

export function filterProjects(projects: Project[], filters: FilterState): Project[] {
  return projects.filter(p => {
    if (filters.search) {
      const s = filters.search.toLowerCase()
      const searchable = [
        p.project_owner, p.analyst, p.client_name, p.client_type,
        p.requestor, p.project_summary, p.country, p.industry, p.status, p.project_type
      ].filter(Boolean).join(' ').toLowerCase()
      if (!searchable.includes(s)) return false
    }
    if (filters.status.length > 0 && !filters.status.includes(p.status)) return false
    if (filters.owner.length > 0 && !filters.owner.includes(p.project_owner)) return false
    if (filters.analyst.length > 0 && !filters.analyst.includes(p.analyst ?? '')) return false
    if (filters.clientType.length > 0 && !filters.clientType.includes(p.client_type ?? '')) return false
    if (filters.industry.length > 0 && !filters.industry.includes(p.industry ?? '')) return false
    if (filters.country.length > 0 && !filters.country.includes(p.country ?? '')) return false
    if (filters.dateFrom && p.date_received && p.date_received < filters.dateFrom) return false
    if (filters.dateTo && p.date_received && p.date_received > filters.dateTo) return false
    return true
  })
}

export function sortProjects(projects: Project[], sort: SortState): Project[] {
  return [...projects].sort((a, b) => {
    const aVal = a[sort.field as keyof Project]
    const bVal = b[sort.field as keyof Project]
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    const cmp = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal))
    return sort.direction === 'asc' ? cmp : -cmp
  })
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  // Aurora returns full ISO timestamps (e.g. "2024-01-15T00:00:00.000Z").
  // Strip to date-part only before appending local midnight, otherwise
  // "...ZT00:00:00" is an invalid date string and renders as "Invalid Date".
  const datePart = d.includes('T') ? d.slice(0, 10) : d
  const date = new Date(datePart + 'T00:00:00')
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'Completed': 'badge-success',
    'In Process': 'badge-info',
    'On Hold': 'badge-warning',
    'Cancelled': 'badge-error',
    'Ready to Deliver': 'badge-secondary',
    'Under Review': 'badge-primary',
    'SKV Validation': 'badge-accent',
  }
  return colors[status] || 'badge-ghost'
}

export function getStatusHex(status: string): string {
  const colors: Record<string, string> = {
    'Completed': '#22c55e',
    'In Process': '#3b82f6',
    'On Hold': '#f59e0b',
    'Cancelled': '#ef4444',
    'Ready to Deliver': '#8b5cf6',
    'Under Review': '#6366f1',
    'SKV Validation': '#14b8a6',
  }
  return colors[status] || '#6b7280'
}

// ─── Project Files ─────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024   // 2 MB
export const MAX_FILES_PER_PROJECT = 5

export interface ProjectFile {
  id: string
  project_id: string
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  uploaded_by: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
  uploader_name: string | null
  uploader_email: string | null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function fetchProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return api<ProjectFile[]>(`delivery/projects/${projectId}/files`).catch(() => [])
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  _userId: string
): Promise<ProjectFile> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${formatFileSize(file.size)} exceeds the 2 MB limit`)
  }
  const existing = await fetchProjectFiles(projectId)
  if (existing.length >= MAX_FILES_PER_PROJECT) {
    throw new Error(`Maximum of ${MAX_FILES_PER_PROJECT} files per project reached`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${projectId}/${Date.now()}_${safeName}`
  await s3UploadFile('project-files', storagePath, file)
  return api<ProjectFile>(`delivery/projects/${projectId}/files`, {
    method: 'POST',
    body: {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      storage_path: storagePath,
    },
  })
}

export async function deleteProjectFile(
  fileId: string,
  storagePath: string,
  _userId: string
): Promise<void> {
  await api(`delivery/files/${fileId}`, { method: 'DELETE' })
  await s3DeleteFile('project-files', storagePath)
}

export async function getProjectFileUrl(storagePath: string): Promise<string> {
  return s3GetSignedUrl('project-files', storagePath)
}

// ─── AI Prediction Utilities ───────────────────────────────────────────────────

export interface PredictionStats {
  overall: { avg: number; median: number; count: number }
  byClientType: Record<string, { avg: number; count: number }>
  byIndustry: Record<string, { avg: number; count: number }>
  byCountry: Record<string, { avg: number; count: number }>
  byJobRange: Record<string, { avg: number; count: number }>
}

export function buildPredictionStats(projects: Project[]): PredictionStats {
  const MAX_DAYS = 365
  const completed = projects.filter(p => p.status === 'Completed' && p.days_to_complete && p.days_to_complete > 0 && p.days_to_complete <= MAX_DAYS)
  const days = completed.map(p => p.days_to_complete as number).sort((a, b) => a - b)

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
  const median = (arr: number[]) => {
    if (!arr.length) return 0
    const mid = Math.floor(arr.length / 2)
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2)
  }

  const groupBy = (field: keyof Project) => {
    const map: Record<string, number[]> = {}
    completed.forEach(p => {
      const key = (p[field] as string) || 'Unknown'
      if (!map[key]) map[key] = []
      map[key].push(p.days_to_complete as number)
    })
    const result: Record<string, { avg: number; count: number }> = {}
    Object.entries(map).forEach(([k, v]) => {
      const sorted_v = [...v].sort((a, b) => a - b)
      result[k] = { avg: median(sorted_v), count: sorted_v.length }
    })
    return result
  }

  const byJobRange: Record<string, { avg: number; count: number }> = {}
  const ranges = [
    { label: '1–10', min: 1, max: 10 },
    { label: '11–50', min: 11, max: 50 },
    { label: '51–100', min: 51, max: 100 },
    { label: '101–500', min: 101, max: 500 },
    { label: '500+', min: 501, max: Infinity },
  ]
  ranges.forEach(r => {
    const group = completed.filter(p => p.job_count != null && p.job_count >= r.min && p.job_count <= r.max)
    const vals = group.map(p => p.days_to_complete as number).sort((a, b) => a - b)
    byJobRange[r.label] = { avg: median(vals), count: vals.length }
  })

  return {
    overall: { avg: avg(days), median: median(days), count: days.length },
    byClientType: groupBy('client_type'),
    byIndustry: groupBy('industry'),
    byCountry: groupBy('country'),
    byJobRange,
  }
}

export function predictDeliveryTime(
  stats: PredictionStats,
  clientType?: string,
  industry?: string,
  country?: string,
  jobCount?: number
): { estimate: number; confidence: string; breakdown: string } {
  const weights: Array<{ days: number; weight: number; label: string }> = []

  if (clientType && stats.byClientType[clientType]) {
    const s = stats.byClientType[clientType]
    weights.push({ days: s.avg, weight: s.count > 10 ? 3 : 1, label: `${clientType} avg: ${s.avg}d` })
  }
  if (industry && stats.byIndustry[industry]) {
    const s = stats.byIndustry[industry]
    weights.push({ days: s.avg, weight: s.count > 10 ? 2 : 1, label: `${industry} avg: ${s.avg}d` })
  }
  if (country && stats.byCountry[country]) {
    const s = stats.byCountry[country]
    weights.push({ days: s.avg, weight: s.count > 10 ? 2 : 1, label: `${country} avg: ${s.avg}d` })
  }
  if (jobCount) {
    const range = jobCount <= 10 ? '1–10' : jobCount <= 50 ? '11–50' : jobCount <= 100 ? '51–100' : jobCount <= 500 ? '101–500' : '500+'
    if (stats.byJobRange[range]) {
      const s = stats.byJobRange[range]
      weights.push({ days: s.avg, weight: 2, label: `${range} jobs avg: ${s.avg}d` })
    }
  }

  if (weights.length === 0) {
    return {
      estimate: stats.overall.median,
      confidence: 'Low',
      breakdown: `Based on overall average of ${stats.overall.count} completed projects`
    }
  }

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0)
  const estimate = Math.round(weights.reduce((s, w) => s + w.days * w.weight, 0) / totalWeight)
  const confidence = weights.length >= 3 ? 'High' : weights.length === 2 ? 'Medium' : 'Low'
  const breakdown = weights.map(w => w.label).join(', ')

  return { estimate, confidence, breakdown }
}

// ─── Analysts ──────────────────────────────────────────────────────────────────

export interface Analyst {
  id: number
  name: string
  is_active: boolean
  created_at: string
}

export async function fetchAnalysts(): Promise<Analyst[]> {
  return api<Analyst[]>('analysts')
}

export async function fetchAllAnalysts(): Promise<Analyst[]> {
  return api<Analyst[]>('analysts/all')
}

export async function createAnalyst(name: string): Promise<Analyst> {
  return api<Analyst>('analysts', { method: 'POST', body: { name } })
}

export async function deactivateAnalyst(id: number): Promise<void> {
  await api(`analysts/${id}/deactivate`, { method: 'PATCH' })
}

export async function reactivateAnalyst(id: number): Promise<void> {
  await api(`analysts/${id}/reactivate`, { method: 'PATCH' })
}

export async function updateAnalyst(id: number, name: string): Promise<void> {
  await api(`analysts/${id}`, { method: 'PATCH', body: { name } })
}

// ─── Client Types ─────────────────────────────────────────────────────────────

export interface ClientType {
  id: number
  name: string
  is_active: boolean
}

export async function fetchClientTypesAdmin(): Promise<ClientType[]> {
  return api<ClientType[]>('client-types')
}

export async function createClientType(name: string): Promise<ClientType> {
  return api<ClientType>('client-types', { method: 'POST', body: { name } })
}

export async function updateClientType(id: number, name: string): Promise<void> {
  await api(`client-types/${id}`, { method: 'PATCH', body: { name } })
}

export async function deactivateClientType(id: number): Promise<void> {
  await api(`client-types/${id}/deactivate`, { method: 'PATCH' })
}

// ─── Project Types ────────────────────────────────────────────────────────────

export interface ProjectType {
  id: number
  name: string
  template_url: string | null
  template_label: string | null
  is_active: boolean
  display_order: number
}

export async function fetchProjectTypes(): Promise<ProjectType[]> {
  return api<ProjectType[]>('project-types')
}

export async function createProjectType(
  name: string,
  templateFile?: File,
  _accessToken?: string
): Promise<ProjectType> {
  let templateUrl: string | null = null
  let templateLabel: string | null = null

  if (templateFile) {
    const safeName = templateFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${Date.now()}_${safeName}`
    await s3UploadFile('project-type-templates', storagePath, templateFile)
    templateUrl = `project-type-templates/${storagePath}`
    templateLabel = templateFile.name
  }

  return api<ProjectType>('project-types', {
    method: 'POST',
    body: { name: name.trim(), template_url: templateUrl, template_label: templateLabel },
  })
}

export async function updateProjectType(
  id: number,
  name: string,
  templateFile?: File,
  _accessToken?: string
): Promise<void> {
  const updates: any = { name: name.trim() }

  if (templateFile) {
    const safeName = templateFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${Date.now()}_${safeName}`
    await s3UploadFile('project-type-templates', storagePath, templateFile)
    updates.template_url = `project-type-templates/${storagePath}`
    updates.template_label = templateFile.name
  }

  await api(`project-types/${id}`, { method: 'PATCH', body: updates })
}

export async function deactivateProjectType(id: number): Promise<void> {
  await api(`project-types/${id}/deactivate`, { method: 'PATCH' })
}

// ─── Delivery Files ───────────────────────────────────────────────────────────

export const MAX_DELIVERY_FILES = 25
export const MAX_DELIVERY_FILE_SIZE_BYTES = 2 * 1024 * 1024   // 2 MB

export interface DeliveryFile {
  id: string
  project_id: string
  file_name: string
  file_size: number
  file_type: string | null
  description: string | null
  storage_path: string
  uploaded_by: string | null
  uploaded_at: string
  updated_at: string
  expires_at: string | null
  uploader_name: string | null
  uploader_email: string | null
  download_count?: number
}

export interface DeliveryFileDownload {
  id: string
  file_id: string
  project_id: string
  downloaded_by: string | null
  downloaded_by_email: string | null
  downloaded_by_name: string | null
  downloaded_at: string
}

export async function fetchDeliveryFiles(projectId: string): Promise<DeliveryFile[]> {
  return api<DeliveryFile[]>(`delivery/projects/${projectId}/delivery-files`).catch(() => [])
}

export async function uploadDeliveryFile(
  projectId: string,
  file: File,
  _userId: string
): Promise<DeliveryFile> {
  if (file.size > MAX_DELIVERY_FILE_SIZE_BYTES) {
    throw new Error(`File size ${formatFileSize(file.size)} exceeds the 2 MB limit`)
  }
  const existing = await fetchDeliveryFiles(projectId)
  if (existing.length >= MAX_DELIVERY_FILES) {
    throw new Error(`Maximum of ${MAX_DELIVERY_FILES} delivery files per project reached`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${projectId}/${Date.now()}_${safeName}`
  await s3UploadFile('project-delivery-files', storagePath, file)
  return api<DeliveryFile>(`delivery/projects/${projectId}/delivery-files`, {
    method: 'POST',
    body: {
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      storage_path: storagePath,
    },
  })
}

export async function updateDeliveryFile(
  fileId: string,
  updates: { file_name?: string; description?: string }
): Promise<void> {
  await api(`delivery/files/${fileId}`, { method: 'PATCH', body: updates })
}

export async function deleteDeliveryFile(
  fileId: string,
  storagePath: string
): Promise<void> {
  await api(`delivery/files/${fileId}`, { method: 'DELETE' })
  await s3DeleteFile('project-delivery-files', storagePath)
}

export async function getDeliveryFileUrl(storagePath: string): Promise<string> {
  return s3GetSignedUrl('project-delivery-files', storagePath)
}

export async function trackDeliveryDownload(
  fileId: string,
  projectId: string,
  userId: string | null,
  userEmail: string | null,
  userName: string | null
): Promise<void> {
  api(`delivery/files/${fileId}/download`, {
    method: 'POST',
    body: { project_id: projectId, downloaded_by: userId, downloaded_by_email: userEmail, downloaded_by_name: userName },
  }).catch(() => {})
}

export async function fetchDeliveryFileDownloads(fileId: string): Promise<DeliveryFileDownload[]> {
  return api<DeliveryFileDownload[]>(`delivery/files/${fileId}/history`).catch(() => [])
}

// ─── Notification Settings ────────────────────────────────────────────────────

export async function fetchNotificationSettings() {
  return api<any[]>('notifications/settings').catch(() => [])
}

export async function updateNotificationSetting(id: string, enabled: boolean) {
  await api(`notifications/settings/${id}`, { method: 'PATCH', body: { enabled } })
}

export async function updateProjectNotificationsEnabled(projectId: string, enabled: boolean) {
  await api(`projects/${projectId}/notifications`, { method: 'PATCH', body: { enabled } })
}

export async function fetchProjectOwnerEmail(userId: string): Promise<string | null> {
  const data = await api<{ email: string | null }>(`settings/profiles/owner-email/${userId}`).catch(() => null)
  return data?.email ?? null
}

// ─── App Settings ──────────────────────────────────────────────────────────────

export async function fetchAppSettings(): Promise<Record<string, string>> {
  // Lambda returns a flat {key: value} object directly — not an array
  return api<Record<string, string>>('settings').catch(() => ({}))
}

export async function updateAppSetting(key: string, value: string): Promise<void> {
  await api(`settings/${key}`, { method: 'PATCH', body: { value } })
}

// ─── Delivery Notes ────────────────────────────────────────────────────────────

export interface DeliveryNote {
  id: string
  project_id: string
  note: string
  created_by: string | null
  created_at: string
  updated_at: string | null
  updated_by: string | null
  author_name: string | null
  author_role: string | null
  updater_name: string | null
}

export async function fetchDeliveryNotes(projectId: string): Promise<DeliveryNote[]> {
  return api<DeliveryNote[]>(`delivery/projects/${projectId}/notes`).catch(() => [])
}

export async function createDeliveryNote(
  projectId: string,
  note: string,
  _userId: string
): Promise<DeliveryNote> {
  return api<DeliveryNote>(`delivery/projects/${projectId}/notes`, {
    method: 'POST',
    body: { note: note.trim() },
  })
}

export async function updateDeliveryNote(
  noteId: string,
  note: string,
  _userId: string
): Promise<void> {
  await api(`delivery/projects/notes/${noteId}`, { method: 'PATCH', body: { note: note.trim() } })
}

export async function deleteDeliveryNote(noteId: string): Promise<void> {
  await api(`delivery/projects/notes/${noteId}`, { method: 'DELETE' })
}

// ─── AI ETA ───────────────────────────────────────────────────────────────────

export async function fetchProjectETAData(projectId: string): Promise<{
  ai_eta_days: number | null
  ai_eta_confidence: string | null
  ai_eta_breakdown: string | null
  ai_eta_override_days: number | null
  ai_eta_override_by: string | null
  ai_eta_override_at: string | null
  ai_eta_override_reason: string | null
} | null> {
  return api(`eta/${projectId}`).catch(() => null)
}

export async function updateProjectETA(
  projectId: string,
  newDays: number,
  reason: string | null,
  _adminUserId: string,
  oldDays: number | null,
  notifyRequester: boolean
): Promise<void> {
  await api(`eta/${projectId}`, {
    method: 'PATCH',
    body: { new_days: newDays, reason: reason || null, old_days: oldDays, notify_requester: notifyRequester },
  })
}

export async function fetchProjectETAHistory(projectId: string): Promise<ProjectETAHistory[]> {
  return api<ProjectETAHistory[]>(`eta/${projectId}/history`).catch(() => [])
}

// ─── Client Management ────────────────────────────────────────────────────────

export interface Client {
  id: number
  name: string
  external_id: string | null
  is_active: boolean
  created_at: string
}

export interface ClientRequest {
  id: number
  requested_name: string
  requested_by: string
  status: 'pending' | 'approved' | 'rejected' | 'reassigned'
  assigned_client_id: number | null
  notes: string | null
  created_at: string
  requester_name?: string | null
  assigned_client_name?: string | null
}

export async function fetchClients(): Promise<Client[]> {
  return api<Client[]>('clients')
}

export async function fetchAllClients(): Promise<Client[]> {
  return api<Client[]>('clients/all')
}

export async function createClient(name: string, externalId?: string): Promise<Client> {
  return api<Client>('clients', { method: 'POST', body: { name: name.trim(), external_id: externalId?.trim() || null } })
}

export async function updateClient(id: number, name: string, externalId?: string): Promise<void> {
  await api(`clients/${id}`, { method: 'PATCH', body: { name: name.trim(), external_id: externalId?.trim() || null } })
}

export async function deactivateClient(id: number): Promise<void> {
  await api(`clients/${id}/deactivate`, { method: 'PATCH' })
}

export async function importClients(rows: { name: string; external_id?: string }[]): Promise<{ inserted: number; skipped: number }> {
  return api('clients/import', { method: 'POST', body: { rows } })
}

export async function submitClientRequest(requestedName: string, _requestedBy: string): Promise<ClientRequest> {
  return api<ClientRequest>('client-requests', { method: 'POST', body: { requested_name: requestedName.trim() } })
}

export async function fetchClientRequests(): Promise<ClientRequest[]> {
  return api<ClientRequest[]>('client-requests')
}

export async function approveClientRequest(requestId: number, existingClientId?: number): Promise<Client> {
  return api<Client>(`client-requests/${requestId}/approve`, {
    method: 'POST',
    body: existingClientId ? { existing_client_id: existingClientId } : {},
  })
}

export async function rejectClientRequest(requestId: number, notes?: string): Promise<void> {
  await api(`client-requests/${requestId}/reject`, { method: 'POST', body: { notes: notes || null } })
}

// ─── Delete Project ───────────────────────────────────────────────────────────

export async function deleteProject(projectId: string): Promise<void> {
  // Best-effort file path fetch for storage cleanup
  const [pFiles, dFiles] = await Promise.all([
    api<Array<{ storage_path: string }>>(`delivery/projects/${projectId}/files`).catch(() => [] as Array<{ storage_path: string }>),
    api<Array<{ storage_path: string }>>(`delivery/projects/${projectId}/delivery-files`).catch(() => [] as Array<{ storage_path: string }>),
  ])

  await api(`projects/${projectId}`, { method: 'DELETE' })

  if (pFiles?.length) {
    await s3DeleteFiles('project-files', pFiles.map(f => f.storage_path))
  }
  if (dFiles?.length) {
    await s3DeleteFiles('project-delivery-files', dFiles.map(f => f.storage_path))
  }
}

// ─── Project Feedback ─────────────────────────────────────────────────────────

export async function fetchProjectFeedback(
  projectId: string
): Promise<{ entries: ProjectFeedback[]; items: ProjectFeedbackItem[] }> {
  return api(`feedback/projects/${projectId}`)
}

export async function fetchProjectFeedbackUnresolvedCount(projectId: string): Promise<number> {
  const data = await api<{ count: number }>(`feedback/projects/${projectId}/unresolved-count`).catch(() => ({ count: 0 }))
  return data.count ?? 0
}

export async function createProjectFeedback(params: {
  projectId: string
  authorId: string
  authorName: string
  authorRole: 'admin' | 'user'
  actionType: string
  message: string | null
  statusChangeToId: number | null
  statusChangeToName: string | null
  notifyRequester: boolean
  items?: Array<{ item_text: string; category: string; priority: string }>
}): Promise<ProjectFeedback> {
  return api<ProjectFeedback>(`feedback/projects/${params.projectId}`, {
    method: 'POST',
    body: {
      author_id: params.authorId,
      author_name: params.authorName,
      author_role: params.authorRole,
      action_type: params.actionType,
      message: params.message,
      status_change_to_id: params.statusChangeToId,
      status_change_to_name: params.statusChangeToName,
      notify_requester: params.notifyRequester,
      items: params.items,
    },
  })
}

export async function resolveProjectFeedbackItem(
  itemId: string,
  note: string | null,
  resolvedById: string,
  resolvedByName: string,
): Promise<void> {
  await api(`feedback/items/${itemId}/resolve`, {
    method: 'PATCH',
    body: { note, resolved_by: resolvedById, resolved_by_name: resolvedByName },
  })
}

export async function unresolveProjectFeedbackItem(itemId: string): Promise<void> {
  await api(`feedback/items/${itemId}/unresolve`, { method: 'PATCH' })
}

export async function submitProjectResponse(
  projectId: string,
  message: string,
  authorId: string,
  authorName: string,
): Promise<ProjectFeedback> {
  return api<ProjectFeedback>(`feedback/projects/${projectId}/user-response`, {
    method: 'POST',
    body: { message, author_id: authorId, author_name: authorName },
  })
}

export async function submitForReReview(
  projectId: string,
  authorId: string,
  authorName: string,
): Promise<void> {
  await api(`feedback/projects/${projectId}/re-review`, {
    method: 'POST',
    body: { author_id: authorId, author_name: authorName },
  })
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  body: string
  projectId?: string | null
  projectName?: string | null
}): Promise<void> {
  api('notifications', {
    method: 'POST',
    body: {
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      project_id: params.projectId ?? null,
      project_name: params.projectName ?? null,
    },
  }).catch(() => {})
}

export async function createNotificationsForAdmins(params: {
  type: NotificationType
  title: string
  body: string
  projectId?: string | null
  projectName?: string | null
  excludeUserId?: string
}): Promise<void> {
  api('notifications/for-admins', {
    method: 'POST',
    body: {
      type: params.type,
      title: params.title,
      body: params.body,
      project_id: params.projectId ?? null,
      project_name: params.projectName ?? null,
      exclude_user_id: params.excludeUserId,
    },
  }).catch(() => {})
}

export async function fetchNotifications(limit = 50, unreadOnly = false): Promise<AppNotification[]> {
  return api<AppNotification[]>('notifications', {
    query: { limit: String(limit), unread_only: String(unreadOnly) },
  }).catch(() => [])
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const data = await api<{ count: number }>('notifications/unread-count').catch(() => ({ count: 0 }))
  return data.count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  api(`notifications/${id}/read`, { method: 'POST' }).catch(() => {})
}

export async function markAllNotificationsRead(): Promise<void> {
  api('notifications/mark-all-read', { method: 'POST' }).catch(() => {})
}

export async function deleteNotification(id: string): Promise<void> {
  api(`notifications/${id}`, { method: 'DELETE' }).catch(() => {})
}

// ─── Text Presets ──────────────────────────────────────────────────────────────

export interface TextPreset {
  id: string
  user_id: string
  name: string
  content: string
  sort_order: number
  created_at: string
}

export async function fetchTextPresets(): Promise<TextPreset[]> {
  return api<TextPreset[]>('settings/text-presets').catch(() => [])
}

export async function createTextPreset(name: string, content: string, sortOrder: number): Promise<TextPreset> {
  return api<TextPreset>('settings/text-presets', {
    method: 'POST',
    body: { name, content, sort_order: sortOrder },
  })
}

export async function updateTextPreset(
  id: string,
  updates: { name?: string; content?: string; sort_order?: number }
): Promise<void> {
  await api(`settings/text-presets/${id}`, { method: 'PATCH', body: updates })
}

export async function deleteTextPreset(id: string): Promise<void> {
  await api(`settings/text-presets/${id}`, { method: 'DELETE' })
}
