export interface ProjectCountry {
  id?: string
  project_id?: string
  country_id: number
  country_name: string
  job_count: number | null
  sort_order?: number
}

export interface ProjectTask {
  id?: string
  project_id?: string
  title: string
  description: string
  sort_order?: number
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface Project {
  id: string
  project_owner: string
  analyst: string | null
  client_type: string | null
  client_type_id?: number | null
  client_name: string | null
  requestor: string | null
  date_received: string | null
  expected_delivery_date: string | null
  date_delivered: string | null
  project_summary: string | null
  job_count: number | null
  days_to_complete: number | null
  status: string
  status_id?: number | null
  country: string | null
  country_id?: number | null
  industry: string | null
  industry_id?: number | null
  project_type: string | null
  id_number?: number | null
  time_allocation?: number | null
  project_countries?: ProjectCountry[]
  project_tasks?: ProjectTask[]
  created_by?: string | null
  created_at?: string | null
  notifications_enabled?: boolean
}

// Input type for multi-country form entries
export interface ProjectCountryInput {
  country_id: number
  country_name: string
  job_count: string   // string for controlled input
}

// Input type for task form entries
export interface ProjectTaskInput {
  id?: string          // present when editing existing task
  title: string
  description: string
}

export interface ProjectFormData {
  project_owner: string
  analyst: string
  client_type_id: number | null
  client_name: string
  requestor: string
  date_received: string
  expected_delivery_date: string
  date_delivered: string
  project_summary: string
  job_count: string
  status_id: number | null
  country_id: number | null       // primary country (backward compat)
  industry_id: number | null
  project_type: string | null
  time_allocation: string  // string for controlled input, convert to number on save
  project_countries: ProjectCountryInput[]
  project_tasks: ProjectTaskInput[]
}

export interface LookupItem {
  id: number
  name: string
}

export interface StatusCount {
  status: string
  count: number
}

export interface OwnerCount {
  project_owner: string
  count: number
  completed: number
  active: number
}

export interface KPIData {
  total: number
  active: number
  completed: number
  cancelled: number
  onHold: number
  avgDaysToComplete: number
  overdue: number
  totalJobs: number
  completionRate: number
}

export interface FilterState {
  search: string
  status: string
  owner: string
  clientType: string
  industry: string
  country: string
  dateFrom: string
  dateTo: string
}

export interface SortState {
  field: string
  direction: 'asc' | 'desc'
}

export type SortField = keyof Project

export type ViewMode =
  | 'dashboard'
  | 'projects'
  | 'table'
  | 'new-project'
  | 'import'
  | 'admin'
  | 'ai'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  username: string | null
  role: 'user' | 'admin'
  is_active: boolean
  created_at: string
  updated_at?: string
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}
