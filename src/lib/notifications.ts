import { supabase, getAuthHeaders } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface NotificationSetting {
  id: string
  setting_key: string
  setting_value: boolean
  label: string
  description: string
}

export async function fetchNotificationSettings(): Promise<NotificationSetting[]> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .order('label')
  if (error) return []
  return (data || []) as NotificationSetting[]
}

export async function updateNotificationSetting(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('notification_settings')
    .update({ setting_value: enabled })
    .eq('id', id)
  if (error) throw new Error(`Failed to update setting: ${error.message}`)
}

export async function updateProjectNotifications(projectId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ notifications_enabled: enabled })
    .eq('id', projectId)
  if (error) throw new Error(`Failed to update notifications: ${error.message}`)
}

export async function fetchProjectOwnerEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return (data as any).email || null
}

export async function sendNotification(payload: {
  type: 'completed' | 'delivery_file' | 'status_changed' | 'eta_changed' | 'project_feedback'
  to: string
  project: Record<string, any>
  files?: Array<{ file_name: string; file_size: number; description?: string }>
  newStatus?: string
  oldDays?: number | null
  newDays?: number
  reason?: string | null
  // project_feedback fields
  actionType?: string
  message?: string | null
  items?: Array<{ item_text: string; category: string; priority: string }>
  adminName?: string
}): Promise<void> {
  // Fire-and-forget: don't block UI on email errors
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/api/send-notification`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      console.warn('[notifications] Send failed:', err)
    }
  } catch (err) {
    console.warn('[notifications] Network error sending notification:', err)
  }
}
