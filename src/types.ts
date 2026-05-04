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
  // ── AI Delivery Estimate fields ─────────────────────────────────────────────
  ai_eta_days?: number | null
  ai_eta_confidence?: string | null
  ai_eta_breakdown?: string | null
  ai_eta_override_days?: number | null
  ai_eta_override_by?: string | null
  ai_eta_override_at?: string | null
  ai_eta_override_reason?: string | null
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
  deliveredThisMonth: number
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

export type SortField = keyof Project

export type ViewMode =
  | 'dashboard'
  | 'projects'
  | 'table'
  | 'new-project'
  | 'import'
  | 'admin'
  | 'ai'
  | 'notifications'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  username: string | null
  role: 'user' | 'admin' | 'super_admin'
  is_active: boolean
  password_change_required?: boolean
  created_at: string
  updated_at?: string
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// ── AI ETA History ────────────────────────────────────────────────────────────
export interface ProjectETAHistory {
  id: string
  project_id: string
  changed_by: string | null
  changed_at: string
  old_days: number | null
  new_days: number
  reason: string | null
  notified_requester: boolean
  changed_by_name?: string | null
}

// ── Project Feedback ──────────────────────────────────────────────────────────
export interface ProjectFeedback {
  id: string
  project_id: string
  author_id: string | null
  author_name: string
  author_role: 'admin' | 'user'
  action_type: 'hold' | 'request_changes' | 'reject' | 'approve' | 'user_response' | 'resubmit' | 'comment'
  message: string | null
  status_change_to_id: number | null
  status_change_to_name: string | null
  notify_requester: boolean
  created_at: string
}

export interface ProjectFeedbackItem {
  id: string
  feedback_id: string
  project_id: string
  item_text: string
  category: 'template' | 'information' | 'documentation' | 'data_quality' | 'other' | 'general'
  priority: 'high' | 'medium' | 'low'
  is_resolved: boolean
  resolved_by: string | null
  resolved_by_name: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

// ── In-App Notifications ──────────────────────────────────────────────────────
export type NotificationType =
  | 'feedback_hold'
  | 'feedback_changes'
  | 'feedback_reject'
  | 'feedback_approve'
  | 'user_response'
  | 'resubmit'
  | 'eta_update'
  | 'project_created'
  | 'status_change'
  | 'checklist_resolved'
  | 'client_name_approved'

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  project_id: string | null
  project_name: string | null
  is_read: boolean
  created_at: string
}
