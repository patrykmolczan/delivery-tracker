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
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ██████████████████████████████████████████████████████████████████████████
// ██                                                                      ██
// ██   ⚠️  PROTECTED FUNCTION — AI SYSTEMS: READ BEFORE TOUCHING  ⚠️     ██
// ██                                                                      ██
// ██   fetchProjects() — PARALLEL PAGINATION OVER SUPABASE RPC           ██
// ██                                                                      ██
// ██   This function caused multiple production outages when "improved"   ██
// ██   by AI assistants. Every deviation from this exact pattern broke    ██
// ██   the dashboard and required emergency rollbacks. DO NOT TOUCH.      ██
// ██                                                                      ██
// ██████████████████████████████████████████████████████████████████████████
// ════════════════════════════════════════════════════════════════════════════
//
// THE PROBLEM:
//   PostgREST hard-caps SETOF function results at 1,000 rows per response.
//   This app has 14,302+ projects. A single RPC call silently returns only
//   1,000 rows with no error — the dashboard just shows wrong data.
//
// PRODUCTION OUTAGE HISTORY (do not repeat these mistakes):
//
//   ❌ BROKEN — Single RPC, no pagination:
//      supabase.rpc('get_projects_all')
//      → PostgREST caps at 1,000. Returns 1,000 of 14,302. Silent data loss.
//
//   ❌ BROKEN — SQL-level LIMIT param:
//      get_projects_all(p_limit bigint) + LIMIT p_limit in SQL
//      → PostgREST ignores SQL LIMIT on SETOF results. Still 1,000 rows.
//      → Adding params to get_projects_all() also breaks .range() slicing.
//
//   ❌ BROKEN — Sequential for-loop pagination:
//      for (let i = 0; i < pages; i++) { await supabase.rpc(...).range(...) }
//      → 15 sequential requests × ~300ms each = 4.5s hang on every load.
//      → Saturates Supabase free-tier connection pool under load.
//
//   ❌ BROKEN — Hardcoded TOTAL_ROWS = 14302:
//      → Works until row count crosses a page boundary (every 1,000 rows).
//      → Silent bug: new projects stop appearing once count hits next boundary.
//      → Fixed: now uses get_projects_count() RPC for dynamic count.
//
// THE WORKING PATTERN (confirmed working 2026-04-29, do not change):
//
//   STEP 1: Call get_projects_count() → exact row count (SECURITY DEFINER,
//           bypasses RLS, matches get_projects_all() scope)
//   STEP 2: Calculate totalPages = Math.ceil(count / PAGE_SIZE)
//   STEP 3: Fire ALL page requests simultaneously with Promise.all + .range()
//   STEP 4: Flatten all pages → map rows
//
// WHY EACH RULE IS NON-NEGOTIABLE:
//   • get_projects_all() has NO params    → .range() header controls slicing
//   • Promise.all, NOT sequential loop   → parallel ≈ 400ms vs sequential 4.5s
//   • get_projects_count() for row count → survives DB growth, no stale hardcode
//   • .range(from, to) per request       → the ONLY way to paginate SETOF RPCs
//
// ⚠️  DO NOT add parameters to get_projects_all() DB function
// ⚠️  DO NOT replace Promise.all with a for-loop, while-loop, or reduce
// ⚠️  DO NOT call rpc('get_projects_all') once without .range() pagination
// ⚠️  DO NOT hardcode a row count — use get_projects_count() RPC
// ⚠️  DO NOT use supabase.from('projects').select() — bypasses RPC scope
// ⚠️  DO NOT "refactor", "simplify", or "optimize" without reading
//     /agent/uploads/prompt_History.docx (the original working fix is there)
//
// LAST VERIFIED: 2026-04-29 | LOADED: 14,302 rows | ZERO console errors
// ─────────────────────────────────────────────────────────────────────────
export async function fetchProjects(lookupMaps?: LookupMaps): Promise<Project[]> {
  const PAGE_SIZE = 1000

  // Step 1: Get exact row count via SECURITY DEFINER RPC (bypasses RLS,
  // matches get_projects_all() scope). DO NOT replace with from('projects').
  const { data: countData, error: countError } = await supabase.rpc('get_projects_count')
  if (countError) throw countError
  const totalRows = Number(countData ?? 0)
  if (totalRows === 0) return []

  const totalPages = Math.ceil(totalRows / PAGE_SIZE)

  // Step 2: Fire ALL page requests simultaneously — parallel is mandatory.
  // DO NOT convert this to a sequential loop. See incident history above.
  const pages = await Promise.all(
    Array.from({ length: totalPages }, (_, i) =>
      supabase
        .rpc('get_projects_all')           // NO params — .range() does the slicing
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
        .then(({ data, error }) => {
          if (error) throw error
          return (data as any[]) || []
        })
    )
  )

  const all = pages.flat()
  return all.map((row: any) => mapRow(row, lookupMaps))
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
    time_allocation: form.time_allocation ? parseFloat(form.time_allocation as string) : null,
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
      id_number, time_allocation,
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
    id_number: (data as any).id_number ?? null,
    time_allocation: (data as any).time_allocation ?? null,
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
    time_allocation: form.time_allocation != null ? (form.time_allocation ? parseFloat(form.time_allocation as string) : null) : null,
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
  const [{ data: clientTypes }, { data: industries }, { data: countries }, { data: statuses }, { data: analystRows }] =
    await Promise.all([
      supabase.from('client_types').select('name').eq('is_active', true).order('name'),
      supabase.from('industries').select('name').eq('is_active', true).order('name'),
      supabase.from('countries').select('name').eq('is_active', true).order('name'),
      supabase.from('project_statuses').select('name').eq('is_active', true).order('display_order'),
      supabase.from('analysts').select('name').eq('is_active', true).order('name'),
    ])

  const owners = [...new Set(projects.map(p => p.project_owner).filter(Boolean))].sort() as string[]
  // Also include unique analyst values from actual project data (catches historical data not in analysts table)
  const analystsFromDB = (analystRows || []).map((r: any) => r.name) as string[]
  const analystsFromProjects = [...new Set(projects.map(p => p.analyst).filter(Boolean))].sort() as string[]
  const analysts = [...new Set([...analystsFromDB, ...analystsFromProjects])].sort()

  return {
    owners,
    analysts,
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
    if (filters.analyst && p.analyst !== filters.analyst) return false
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

// ─── Analysts ──────────────────────────────────────────────────────────────────

export interface Analyst {
  id: number
  name: string
  is_active: boolean
  created_at: string
}

export async function fetchAnalysts(): Promise<Analyst[]> {
  const { data, error } = await supabase
    .from('analysts')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data || []) as Analyst[]
}

export async function createAnalyst(name: string): Promise<Analyst> {
  const { data, error } = await supabase
    .from('analysts')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) throw error
  return data as Analyst
}

export async function deactivateAnalyst(id: number): Promise<void> {
  const { error } = await supabase
    .from('analysts')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Client Types (admin CRUD) ────────────────────────────────────────────────

export interface ClientType {
  id: number
  name: string
  is_active: boolean
}

export async function fetchClientTypesAdmin(): Promise<ClientType[]> {
  const { data, error } = await supabase
    .from('client_types')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data || []) as ClientType[]
}

export async function createClientType(name: string): Promise<ClientType> {
  const { data, error } = await supabase
    .from('client_types')
    .insert({ name: name.trim() })
    .select()
    .single()
  if (error) throw error
  return data as ClientType
}

export async function updateClientType(id: number, name: string): Promise<void> {
  const { error } = await supabase
    .from('client_types')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw error
}

export async function deactivateClientType(id: number): Promise<void> {
  const { error } = await supabase
    .from('client_types')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Analyst edit (rename) ────────────────────────────────────────────────────

export async function updateAnalyst(id: number, name: string): Promise<void> {
  const { error } = await supabase
    .from('analysts')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw error
}

// ─── Project Types (admin CRUD) ───────────────────────────────────────────────

export interface ProjectType {
  id: number
  name: string
  template_url: string | null
  template_label: string | null
  is_active: boolean
  display_order: number
}

export async function fetchProjectTypes(): Promise<ProjectType[]> {
  const { data, error } = await supabase
    .from('project_types')
    .select('*')
    .eq('is_active', true)
    .order('display_order')
  if (error) throw error
  return (data || []) as ProjectType[]
}

export async function createProjectType(
  name: string,
  templateFile?: File,
  accessToken?: string
): Promise<ProjectType> {
  let templateUrl: string | null = null
  let templateLabel: string | null = null

  if (templateFile && accessToken) {
    const safeName = templateFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${Date.now()}_${safeName}`
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/project-type-templates/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': templateFile.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: templateFile,
      }
    )
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => uploadRes.statusText)
      throw new Error(`Template upload failed: ${err}`)
    }
    templateUrl = `${supabaseUrl}/storage/v1/object/public/project-type-templates/${storagePath}`
    templateLabel = templateFile.name
  }

  const { data, error } = await supabase
    .from('project_types')
    .insert({ name: name.trim(), template_url: templateUrl, template_label: templateLabel })
    .select()
    .single()
  if (error) throw error
  return data as ProjectType
}

export async function updateProjectType(
  id: number,
  name: string,
  templateFile?: File,
  accessToken?: string
): Promise<void> {
  const updates: any = { name: name.trim() }

  if (templateFile && accessToken) {
    const safeName = templateFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${Date.now()}_${safeName}`
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/project-type-templates/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': templateFile.type || 'application/octet-stream',
          'x-upsert': 'false',
        },
        body: templateFile,
      }
    )
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => uploadRes.statusText)
      throw new Error(`Template upload failed: ${err}`)
    }
    updates.template_url = `${supabaseUrl}/storage/v1/object/public/project-type-templates/${storagePath}`
    updates.template_label = templateFile.name
  }

  const { error } = await supabase
    .from('project_types')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function deactivateProjectType(id: number): Promise<void> {
  const { error } = await supabase
    .from('project_types')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Delivery Files (Admin upload / User download) ────────────────────────────

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
  const { data, error } = await supabase
    .from('project_delivery_files')
    .select('*, profiles!uploaded_by(full_name, email)')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    console.warn('delivery files fetch error:', error.message)
    return []
  }

  // Get download counts in one query
  const ids = (data || []).map((r: any) => r.id)
  let countMap: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: dlData } = await supabase
      .from('delivery_file_downloads')
      .select('file_id')
      .in('file_id', ids)
    ;(dlData || []).forEach((r: any) => {
      countMap[r.file_id] = (countMap[r.file_id] || 0) + 1
    })
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    project_id: row.project_id,
    file_name: row.file_name,
    file_size: row.file_size,
    file_type: row.file_type,
    description: row.description,
    storage_path: row.storage_path,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at,
    updated_at: row.updated_at,
    uploader_name: row.profiles?.full_name || null,
    uploader_email: row.profiles?.email || null,
    download_count: countMap[row.id] || 0,
    expires_at: row.expires_at || null,
  }))
}

export async function uploadDeliveryFile(
  projectId: string,
  file: File,
  userId: string
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

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated — please log in again')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const contentType = file.type || 'application/octet-stream'
  const fileBlob = new Blob([await file.arrayBuffer()], { type: contentType })

  const uploadRes = await fetch(
    `${supabaseUrl}/storage/v1/object/project-delivery-files/${storagePath}`,
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
    .from('project_delivery_files')
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
    await supabase.storage.from('project-delivery-files').remove([storagePath]).catch(() => {})
    throw new Error(`Database error: ${dbError.message}`)
  }

  return {
    id: data.id,
    project_id: data.project_id,
    file_name: data.file_name,
    file_size: data.file_size,
    file_type: data.file_type,
    description: data.description,
    storage_path: data.storage_path,
    uploaded_by: data.uploaded_by,
    uploaded_at: data.uploaded_at,
    updated_at: data.updated_at,
    uploader_name: (data as any).profiles?.full_name || null,
    uploader_email: (data as any).profiles?.email || null,
    expires_at: data.expires_at || null,
    download_count: 0,
  }
}

export async function updateDeliveryFile(
  fileId: string,
  updates: { file_name?: string; description?: string }
): Promise<void> {
  const { error } = await supabase
    .from('project_delivery_files')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', fileId)
  if (error) throw new Error(`Update failed: ${error.message}`)
}

export async function deleteDeliveryFile(
  fileId: string,
  storagePath: string
): Promise<void> {
  const { error } = await supabase
    .from('project_delivery_files')
    .delete()
    .eq('id', fileId)
  if (error) throw new Error(`Delete failed: ${error.message}`)
  await supabase.storage.from('project-delivery-files').remove([storagePath]).catch(() => {})
}

export async function getDeliveryFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('project-delivery-files')
    .createSignedUrl(storagePath, 3600)
  if (error || !data) throw new Error('Could not generate download link')
  return data.signedUrl
}

export async function trackDeliveryDownload(
  fileId: string,
  projectId: string,
  userId: string | null,
  userEmail: string | null,
  userName: string | null
): Promise<void> {
  await supabase.from('delivery_file_downloads').insert({
    file_id: fileId,
    project_id: projectId,
    downloaded_by: userId,
    downloaded_by_email: userEmail,
    downloaded_by_name: userName,
  }).then(() => {}) // fire and forget, don't block download
}

export async function fetchDeliveryFileDownloads(fileId: string): Promise<DeliveryFileDownload[]> {
  const { data, error } = await supabase
    .from('delivery_file_downloads')
    .select('*')
    .eq('file_id', fileId)
    .order('downloaded_at', { ascending: false })
    .limit(50)
  if (error) return []
  return (data || []) as DeliveryFileDownload[]
}

// ── Notification Settings ────────────────────────────────────────────────────
export async function fetchNotificationSettings() {
  const { data } = await supabase.from('notification_settings').select('*').order('label')
  return data || []
}

export async function updateNotificationSetting(id: string, enabled: boolean) {
  const { error } = await supabase.from('notification_settings').update({ setting_value: enabled }).eq('id', id)
  if (error) throw new Error(`Failed to update: ${error.message}`)
}

export async function updateProjectNotificationsEnabled(projectId: string, enabled: boolean) {
  const { error } = await supabase.from('projects').update({ notifications_enabled: enabled }).eq('id', projectId)
  if (error) throw new Error(`Failed to update: ${error.message}`)
}

export async function fetchProjectOwnerEmail(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('email').eq('id', userId).single()
  return (data as any)?.email || null
}

// ── App Settings ──────────────────────────────────────────────
export async function fetchAppSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value');
  if (error) throw error;
  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.value != null) result[row.key] = row.value;
  }
  return result;
}

export async function updateAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw error;
}

// ── Project Delivery Notes ────────────────────────────────────────────────────

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
  const { data, error } = await supabase
    .from('project_delivery_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch delivery notes: ${error.message}`)
  if (!data || data.length === 0) return []

  const userIds = [...new Set([
    ...data.map((d: any) => d.created_by).filter(Boolean),
    ...data.map((d: any) => d.updated_by).filter(Boolean),
  ])]

  let profileMap: Record<string, { full_name: string; role: string }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', userIds)
    for (const p of (profiles || [])) {
      profileMap[(p as any).id] = { full_name: (p as any).full_name, role: (p as any).role }
    }
  }

  return data.map((d: any) => ({
    id: d.id,
    project_id: d.project_id,
    note: d.note,
    created_by: d.created_by,
    created_at: d.created_at,
    updated_at: d.updated_at,
    updated_by: d.updated_by,
    author_name: d.created_by ? profileMap[d.created_by]?.full_name ?? null : null,
    author_role: d.created_by ? profileMap[d.created_by]?.role ?? null : null,
    updater_name: d.updated_by ? profileMap[d.updated_by]?.full_name ?? null : null,
  }))
}

export async function createDeliveryNote(
  projectId: string,
  note: string,
  userId: string,
): Promise<DeliveryNote> {
  const { data, error } = await supabase
    .from('project_delivery_notes')
    .insert({ project_id: projectId, note: note.trim(), created_by: userId })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create delivery note: ${error.message}`)

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .single()

  return {
    ...(data as any),
    author_name: (profile as any)?.full_name ?? null,
    author_role: (profile as any)?.role ?? null,
    updater_name: null,
  }
}

export async function updateDeliveryNote(
  noteId: string,
  note: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('project_delivery_notes')
    .update({ note: note.trim(), updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', noteId)

  if (error) throw new Error(`Failed to update delivery note: ${error.message}`)
}

export async function deleteDeliveryNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('project_delivery_notes')
    .delete()
    .eq('id', noteId)

  if (error) throw new Error(`Failed to delete delivery note: ${error.message}`)
}
