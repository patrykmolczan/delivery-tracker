import { supabase } from './supabase'
import type {
  Project, KPIData, StatusCount, OwnerCount, FilterState, SortState,
  LookupItem, ProjectFormData, ProjectCountry, ProjectCountryInput, ProjectTask,
} from '../types'

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

const SELECT_COLS = `
  id, project_owner, analyst, client_name, requestor,
  date_received, expected_delivery_date, date_delivered,
  project_summary, job_count, days_to_complete, created_by, created_at,
  project_type, status_id, client_type_id, country_id, industry_id
`

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
    created_by: row.created_by,
    created_at: row.created_at,
  }
}

// Fetch projects WITHOUT JOINs using pagination to overcome the 1000-row PostgREST limit.
// Pass lookupMaps to resolve ID→name client-side.
export async function fetchProjects(lookupMaps?: LookupMaps): Promise<Project[]> {
  const PAGE_SIZE = 1000
  const allRows: any[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('projects')
      .select(SELECT_COLS)
      .order('date_received', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows.map((row: any) => mapRow(row, lookupMaps))
}

export async function fetchLookups(): Promise<{
  statuses: LookupItem[]
  clientTypes: LookupItem[]
  industries: LookupItem[]
  countries: LookupItem[]
}> {
  const [{ data: statuses }, { data: clientTypes }, { data: industries }, { data: countries }] =
    await Promise.all([
      supabase.from('project_statuses').select('id, name').eq('is_active', true).order('display_order'),
      supabase.from('client_types').select('id, name').eq('is_active', true).order('name'),
      supabase.from('industries').select('id, name').eq('is_active', true).order('name'),
      supabase.from('countries').select('id, name').eq('is_active', true).order('name'),
    ])

  return {
    statuses: (statuses || []) as LookupItem[],
    clientTypes: (clientTypes || []) as LookupItem[],
    industries: (industries || []) as LookupItem[],
    countries: (countries || []) as LookupItem[],
  }
}

export async function createProject(form: ProjectFormData, userId: string): Promise<Project> {
  const insertData: any = {
    project_owner: form.project_owner,
    analyst: form.analyst || null,
    client_type_id: form.client_type_id,
    client_name: form.client_name,
    requestor: form.requestor || null,
    date_received: form.date_received,
    expected_delivery_date: form.expected_delivery_date || null,
    date_delivered: form.date_delivered || null,
    project_summary: form.project_summary || null,
    job_count: form.job_count ? parseInt(form.job_count) : null,
    status_id: form.status_id,
    country_id: form.project_countries.length > 0
      ? form.project_countries[0].country_id
      : form.country_id,
    industry_id: form.industry_id,
    project_type: form.project_type || null,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(insertData)
    .select(`
      id, project_owner, analyst, client_name, requestor,
      date_received, expected_delivery_date, date_delivered,
      project_summary, job_count, days_to_complete, created_by, created_at,
      project_type, status_id, client_type_id, country_id, industry_id,
      project_statuses!inner(name),
      client_types(name),
      countries(name),
      industries(name)
    `)
    .single()

  if (error) throw error

  const projectId = data.id

  // Sync multi-country entries
  if (form.project_countries.length > 0) {
    await syncProjectCountries(projectId, form.project_countries)
  }

  // Sync task items
  if (form.project_tasks.length > 0) {
    await syncProjectTasks(projectId, form.project_tasks, userId)
  }

  return {
    id: data.id,
    project_owner: data.project_owner,
    analyst: data.analyst,
    client_name: data.client_name,
    requestor: data.requestor,
    date_received: data.date_received,
    expected_delivery_date: data.expected_delivery_date,
    date_delivered: data.date_delivered,
    project_summary: data.project_summary,
    job_count: data.job_count,
    days_to_complete: data.days_to_complete,
    status: (data as any).project_statuses?.name || 'Unknown',
    status_id: data.status_id,
    client_type: (data as any).client_types?.name || null,
    client_type_id: data.client_type_id,
    country: (data as any).countries?.name || null,
    country_id: data.country_id,
    industry: (data as any).industries?.name || null,
    industry_id: data.industry_id,
    project_type: (data as any).project_type || null,
    created_by: data.created_by,
    created_at: data.created_at,
  }
}

export async function updateProject(id: string, form: ProjectFormData): Promise<void> {
  const updateData: any = {
    project_owner: form.project_owner,
    analyst: form.analyst || null,
    client_type_id: form.client_type_id,
    client_name: form.client_name,
    requestor: form.requestor || null,
    date_received: form.date_received,
    expected_delivery_date: form.expected_delivery_date || null,
    date_delivered: form.date_delivered || null,
    project_summary: form.project_summary || null,
    job_count: form.job_count ? parseInt(form.job_count) : null,
    status_id: form.status_id,
    country_id: form.project_countries.length > 0
      ? form.project_countries[0].country_id
      : form.country_id,
    industry_id: form.industry_id,
    project_type: form.project_type || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('projects').update(updateData).eq('id', id)
  if (error) throw error

  // Sync multi-country entries (full replace)
  await syncProjectCountries(id, form.project_countries)

  // Sync task items (full replace by id)
  await syncProjectTasks(id, form.project_tasks)
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

export async function updateProjectStatus(
  id: string,
  statusId: number,
  dateReceived: string | null,
  markDelivered: boolean
): Promise<{ date_delivered: string | null; days_to_complete: number | null }> {
  const today = new Date().toISOString().slice(0, 10)
  const dateDelivered = markDelivered ? today : null
  let daysToComplete: number | null = null

  if (markDelivered && dateReceived) {
    const start = new Date(dateReceived + 'T00:00:00')
    const end = new Date(today + 'T00:00:00')
    daysToComplete = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
  }

  const updateData: any = {
    status_id: statusId,
    updated_at: new Date().toISOString(),
  }
  if (markDelivered) {
    updateData.date_delivered = dateDelivered
  }

  const { error } = await supabase.from('projects').update(updateData).eq('id', id)
  if (error) throw error
  return { date_delivered: dateDelivered, days_to_complete: daysToComplete }
}

// ─── Project Countries ─────────────────────────────────────────────────────────

export async function fetchProjectCountries(projectId: string): Promise<ProjectCountry[]> {
  const { data, error } = await supabase
    .from('project_countries')
    .select('*, countries(name)')
    .eq('project_id', projectId)
    .order('sort_order')

  if (error) {
    console.warn('project_countries fetch error:', error.message)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    country_id: row.country_id,
    country_name: row.countries?.name || '',
    job_count: row.job_count,
    sort_order: row.sort_order,
  }))
}

export async function syncProjectCountries(
  projectId: string,
  entries: ProjectCountryInput[]
): Promise<void> {
  // Delete all existing and re-insert (simplest correct approach)
  await supabase.from('project_countries').delete().eq('project_id', projectId)

  if (entries.length === 0) return

  const rows = entries.map((e, i) => ({
    project_id: projectId,
    country_id: e.country_id,
    job_count: e.job_count ? parseInt(e.job_count) : null,
    sort_order: i,
  }))

  const { error } = await supabase.from('project_countries').insert(rows)
  if (error) throw new Error(`Failed to save countries: ${error.message}`)
}

// ─── Project Tasks ─────────────────────────────────────────────────────────────

export async function fetchProjectTasks(projectId: string): Promise<ProjectTask[]> {
  const { data, error } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')

  if (error) {
    console.warn('project_tasks fetch error:', error.message)
    return []
  }

  return (data || []) as ProjectTask[]
}

export async function syncProjectTasks(
  projectId: string,
  tasks: Array<{ id?: string; title: string; description: string }>,
  userId?: string
): Promise<void> {
  // Get existing task IDs
  const { data: existing } = await supabase
    .from('project_tasks')
    .select('id')
    .eq('project_id', projectId)

  const existingIds = new Set((existing || []).map((r: any) => r.id))
  const incomingIds = new Set(tasks.filter(t => t.id).map(t => t.id!))

  // Delete tasks that were removed
  const toDelete = [...existingIds].filter(id => !incomingIds.has(id))
  if (toDelete.length > 0) {
    await supabase.from('project_tasks').delete().in('id', toDelete)
  }

  // Upsert all incoming tasks
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (task.id && existingIds.has(task.id)) {
      // Update existing
      await supabase.from('project_tasks')
        .update({ title: task.title, description: task.description, sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', task.id)
    } else {
      // Insert new
      await supabase.from('project_tasks').insert({
        project_id: projectId,
        title: task.title,
        description: task.description || null,
        sort_order: i,
        created_by: userId || null,
      })
    }
  }
}

// ─── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  project_id: string
  user_id: string | null
  action: string
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export async function fetchProjectHistory(projectId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.warn('audit_log fetch error:', error.message)
    return []
  }
  return (data || []) as AuditEntry[]
}

// ─── CSV Import ────────────────────────────────────────────────────────────────

export async function importProjectsBatch(
  rows: ProjectFormData[],
  userId: string
): Promise<{ success: number; errors: string[] }> {
  const errors: string[] = []
  let success = 0

  const BATCH_SIZE = 50
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(form => ({
      project_owner: form.project_owner,
      analyst: form.analyst || null,
      client_type_id: form.client_type_id,
      client_name: form.client_name,
      requestor: form.requestor || null,
      date_received: form.date_received,
      expected_delivery_date: form.expected_delivery_date || null,
      date_delivered: form.date_delivered || null,
      project_summary: form.project_summary || null,
      job_count: form.job_count ? parseInt(form.job_count) : null,
      status_id: form.status_id,
      country_id: form.country_id,
      industry_id: form.industry_id,
      created_by: userId,
    }))

    const { error } = await supabase.from('projects').insert(batch)
    if (error) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
    } else {
      success += batch.length
    }
  }

  return { success, errors }
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

// Now synchronous — pass the already-loaded projects array
export function fetchStatusCounts(projects: Project[]): StatusCount[] {
  const map: Record<string, number> = {}
  projects.forEach(p => { map[p.status] = (map[p.status] || 0) + 1 })
  return Object.entries(map)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}

export function fetchOwnerCounts(projects: Project[]): OwnerCount[] {
  const map: Record<string, OwnerCount> = {}
  projects.forEach(p => {
    if (!p.project_owner) return
    if (!map[p.project_owner]) {
      map[p.project_owner] = { project_owner: p.project_owner, count: 0, completed: 0, active: 0 }
    }
    map[p.project_owner].count++
    if (p.status === 'Completed') map[p.project_owner].completed++
    else if (!['Completed', 'Cancelled'].includes(p.status)) map[p.project_owner].active++
  })
  return Object.values(map).sort((a, b) => b.count - a.count)
}

// Accept already-loaded projects to derive owners; fetch lookup dropdowns from DB
export async function fetchFilterOptions(projects: Project[]) {
  const [{ data: clientTypes }, { data: industries }, { data: countries }, { data: statuses }] =
    await Promise.all([
      supabase.from('client_types').select('name').eq('is_active', true).order('name'),
      supabase.from('industries').select('name').eq('is_active', true).order('name'),
      supabase.from('countries').select('name').eq('is_active', true).order('name'),
      supabase.from('project_statuses').select('name').eq('is_active', true).order('display_order'),
    ])

  const owners = [...new Set(projects.map(p => p.project_owner).filter(Boolean))].sort() as string[]

  return {
    owners,
    clientTypes: (clientTypes || []).map((r: any) => r.name),
    industries: (industries || []).map((r: any) => r.name),
    countries: (countries || []).map((r: any) => r.name),
    statuses: (statuses || []).map((r: any) => r.name),
  }
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

  return {
    total: projects.length, active: active.length, completed: completed.length,
    cancelled: cancelled.length, onHold: onHold.length,
    avgDaysToComplete: avgDays, overdue: overdue.length,
    totalJobs, completionRate,
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
    if (filters.status && p.status !== filters.status) return false
    if (filters.owner && p.project_owner !== filters.owner) return false
    if (filters.clientType && p.client_type !== filters.clientType) return false
    if (filters.industry && p.industry !== filters.industry) return false
    if (filters.country && p.country !== filters.country) return false
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
  const date = new Date(d + 'T00:00:00')
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
  const { data, error } = await supabase
    .from('project_files')
    .select('*, profiles!uploaded_by(full_name, email)')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('project_files fetch error:', error.message)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    file_name: row.file_name,
    file_size: row.file_size,
    file_type: row.file_type,
    storage_path: row.storage_path,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
    uploader_name: row.profiles?.full_name || null,
    uploader_email: row.profiles?.email || null,
  }))
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  userId: string
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

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated — please log in again')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const contentType = file.type || 'application/octet-stream'
  const fileBlob = new Blob([await file.arrayBuffer()], { type: contentType })

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/project-files/${storagePath}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body: fileBlob,
    }
  )

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText)
    throw new Error(`Upload failed: ${errText}`)
  }

  const { data, error: dbError } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select('*, profiles!uploaded_by(full_name, email)')
    .single()

  if (dbError) {
    await supabase.storage.from('project-files').remove([storagePath])
    throw new Error(`Database error: ${dbError.message}`)
  }

  return {
    id: data.id,
    project_id: data.project_id,
    file_name: data.file_name,
    file_size: data.file_size,
    file_type: data.file_type,
    storage_path: data.storage_path,
    uploaded_by: data.uploaded_by,
    created_at: data.created_at,
    deleted_at: data.deleted_at,
    deleted_by: data.deleted_by,
    uploader_name: (data as any).profiles?.full_name || null,
    uploader_email: (data as any).profiles?.email || null,
  }
}

export async function deleteProjectFile(
  fileId: string,
  storagePath: string,
  _userId: string
): Promise<void> {
  const { error: dbError } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)

  if (dbError) throw new Error(`Delete failed: ${dbError.message}`)
  await supabase.storage.from('project-files').remove([storagePath]).catch(() => {})
}

export async function getProjectFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('project-files')
    .createSignedUrl(storagePath, 3600)

  if (error || !data) throw new Error('Could not generate download link')
  return data.signedUrl
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
  const completed = projects.filter(p => p.status === 'Completed' && p.days_to_complete && p.days_to_complete > 0)
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
      result[k] = { avg: avg(v), count: v.length }
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
    const vals = group.map(p => p.days_to_complete as number)
    byJobRange[r.label] = { avg: avg(vals), count: vals.length }
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
      estimate: stats.overall.avg,
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
