export interface Project {
  id: string
  project_owner: string
  analyst: string | null
  client_name: string
  requestor: string
  date_received: string
  expected_delivery_date: string | null
  date_delivered: string | null
  project_summary: string
  job_count: number
  days_to_complete: number | null
  status: string
  status_id: number
  client_type: string | null
  client_type_id: number | null
  country: string | null
  country_id: number | null
  industry: string | null
  industry_id: number | null
  project_type: string | null
  id_number: string | null
  time_allocation: number | null
  notifications_enabled: boolean
  created_by: string | null
  created_at: string | null
  ai_eta_days: number | null
  ai_eta_confidence: string | null
  ai_eta_breakdown: string | null
  ai_eta_override_days: number | null
  ai_eta_override_by: string | null
  ai_eta_override_at: string | null
  ai_eta_override_reason: string | null
}

export interface ProjectTask {
  id: string
  project_id: string
  task_name: string
  status: string
  due_date: string | null
  assigned_to: string | null
  created_at: string
}

export interface ProjectETAHistory {
  id: string
  project_id: string
  changed_by: string
  changed_at: string
  old_eta_days: number | null
  new_eta_days: number
  reason: string | null
  email_sent: boolean
}

export interface ProjectFormData {
  client_name: string
  requestor: string
  date_received: string
  expected_delivery_date: string
  project_summary: string
  job_count: number
  status_id: number
  client_type_id: number | null
  country_id: number | null
  industry_id: number | null
  project_type: string
  id_number: string
  time_allocation: number | null
  project_owner: string
  analyst: string
  notifications_enabled: boolean
}

export interface ProjectCountryInput {
  project_id: string
  country_id: number
}

export interface ProjectCountry {
  project_id: string
  country_id: number
  country_name: string
}

export interface KPIData {
  total: number
  inProgress: number
  completed: number
  overdue: number
  avgDays: number
}

export interface StatusCount {
  status: string
  count: number
}

export interface OwnerCount {
  owner: string
  count: number
}

export interface LookupItem {
  id: number
  name: string
}

export interface FilterState {
  search: string
  status: string[]
  owner: string[]
  analyst: string[]
  clientType: string[]
  industry: string[]
  country: string[]
  dateFrom: string
  dateTo: string
}

export interface SortState {
  field: string
  direction: 'asc' | 'desc'
}

export type ViewMode = 'table' | 'kanban' | 'timeline'
