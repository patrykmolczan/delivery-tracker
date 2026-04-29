export interface Project {
  id: string;
  project_owner: string;
  analyst: string | null;
  client_type: string | null;
  client_type_id?: number | null;
  client_name: string | null;
  requestor: string | null;
  date_received: string | null;
  expected_delivery_date: string | null;
  date_delivered: string | null;
  project_summary: string | null;
  job_count: number | null;
  days_to_complete: number | null;
  status: string;
  status_id?: number | null;
  country: string | null;
  country_id?: number | null;
  industry: string | null;
  industry_id?: number | null;
  created_by?: string | null;
  created_at?: string | null;
}

export interface ProjectFormData {
  project_owner: string;
  analyst: string;
  client_type_id: number | null;
  client_name: string;
  requestor: string;
  date_received: string;
  expected_delivery_date: string;
  date_delivered: string;
  project_summary: string;
  job_count: string;
  status_id: number | null;
  country_id: number | null;
  industry_id: number | null;
}

export interface LookupItem {
  id: number;
  name: string;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface OwnerCount {
  project_owner: string;
  count: number;
  completed: number;
  active: number;
}

export interface KPIData {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  onHold: number;
  avgDaysToComplete: number;
  overdue: number;
  totalJobs: number;
  completionRate: number;
}

export interface FilterState {
  search: string;
  status: string;
  owner: string;
  clientType: string;
  industry: string;
  country: string;
  dateFrom: string;
  dateTo: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

export type ViewMode = 'dashboard' | 'table' | 'new-project' | 'import' | 'admin' | 'ai';
export type SortField = keyof Project;

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
