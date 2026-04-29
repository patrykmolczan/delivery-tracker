import { supabase } from './supabase'
import type { Project, KPIData, StatusCount, OwnerCount, FilterState, SortState, LookupItem, ProjectFormData } from '../types'

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, project_owner, analyst, client_name, requestor,
      date_received, expected_delivery_date, date_delivered,
      project_summary, job_count, days_to_complete, created_by, created_at,
      status_id, client_type_id, country_id, industry_id,
      project_statuses!inner(name),
      client_types(name),
      countries(name),
      industries(name)
    `)
    .order('date_received', { ascending: false })

  if (error) throw error

  return (data || []).map((row: any) => ({
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
    status: row.project_statuses?.name || 'Unknown',
    status_id: row.status_id,
    client_type: row.client_types?.name || null,
    client_type_id: row.client_type_id,
    country: row.countries?.name || null,
    country_id: row.country_id,
    industry: row.industries?.name || null,
    industry_id: row.industry_id,
    created_by: row.created_by,
    created_at: row.created_at,
  }))
}

export async function fetchLookups(): Promise<{
  statuses: LookupItem[];
  clientTypes: LookupItem[];
  industries: LookupItem[];
  countries: LookupItem[];
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
    country_id: form.country_id,
    industry_id: form.industry_id,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(insertData)
    .select(`
      id, project_owner, analyst, client_name, requestor,
      date_received, expected_delivery_date, date_delivered,
      project_summary, job_count, days_to_complete, created_by, created_at,
      status_id, client_type_id, country_id, industry_id,
      project_statuses!inner(name),
      client_types(name),
      countries(name),
      industries(name)
    `)
    .single()

  if (error) throw error

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
    country_id: form.country_id,
    industry_id: form.industry_id,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id)

  if (error) throw error
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
    // days_to_complete is a GENERATED ALWAYS column — DB computes it from date_delivered - date_received automatically
  }

  const { error } = await supabase.from('projects').update(updateData).eq('id', id)
  if (error) throw error
  return { date_delivered: dateDelivered, days_to_complete: daysToComplete }
}

export interface AuditEntry {
  id: string
  action: string
  changed_at: string
  user_id: string | null
  old_data: Record<string, any> | null
  new_data: Record<string, any> | null
  user_email?: string | null
  user_name?: string | null
}

export async function fetchProjectHistory(projectId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('record_id', projectId)
    .order('changed_at', { ascending: false })
    .limit(50)

  if (error) {
    console.warn('audit_log fetch error:', error.message)
    return []
  }
  return (data || []) as AuditEntry[]
}

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

export async function fetchStatusCounts(): Promise<StatusCount[]> {
  const projects = await fetchProjects()
  const map: Record<string, number> = {}
  projects.forEach(p => { map[p.status] = (map[p.status] || 0) + 1 })
  return Object.entries(map)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}

export async function fetchOwnerCounts(): Promise<OwnerCount[]> {
  const projects = await fetchProjects()
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

export async function fetchFilterOptions() {
  const [{ data: clientTypes }, { data: industries }, { data: countries }, { data: statuses }] =
    await Promise.all([
      supabase.from('client_types').select('name').eq('is_active', true).order('name'),
      supabase.from('industries').select('name').eq('is_active', true).order('name'),
      supabase.from('countries').select('name').eq('is_active', true).order('name'),
      supabase.from('project_statuses').select('name').eq('is_active', true).order('display_order'),
    ])

  const projects = await fetchProjects()
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
        p.requestor, p.project_summary, p.country, p.industry, p.status
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

// ─── AI Prediction Utilities ──────────────────────────────────────────────────
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
