/**
 * notifications.ts — Notification helpers via Lambda API
 * Fully migrated off Supabase; all queries go through Aurora via Lambda.
 */
import { getAuthHeaders } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface NotificationSetting {
  id: string
  setting_key: string
  setting_value: boolean
  label: string
  description: string
}

export async function fetchNotificationSettings(): Promise<NotificationSetting[]> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/api/notifications/settings`, { headers })
    if (!res.ok) return []
    return (await res.json()) || []
  } catch {
    return []
  }
}

export async function updateNotificationSetting(id: string, enabled: boolean): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/notifications/settings/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error(`Failed to update setting`)
}

export async function updateProjectNotifications(projectId: string, enabled: boolean): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/notifications`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ notifications_enabled: enabled }),
  })
  if (!res.ok) throw new Error(`Failed to update notifications`)
}

export async function fetchProjectOwnerEmail(userId: string): Promise<string | null> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/api/profiles/owner-email/${userId}`, { headers })
    if (!res.ok) return null
    const data = await res.json()
    return data.email ?? null
  } catch {
    return null
  }
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
