/**
 * chat.ts — Project chat messages via Lambda API
 * Fully migrated off Supabase; all queries go through Aurora via Lambda.
 */
import { getAuthHeaders } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export interface ProjectMessage {
  id: string
  project_id: string
  sender_id: string | null
  sender_name: string
  sender_role: string
  message: string
  read_by: string[]
  created_at: string
}

export async function fetchMessages(projectId: string): Promise<ProjectMessage[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/chat/${projectId}`, { headers })
  if (!res.ok) throw new Error('Failed to fetch messages')
  return (await res.json()) || []
}

export async function sendMessage(
  projectId: string,
  _senderId: string,
  _senderName: string,
  _senderRole: string,
  message: string
): Promise<ProjectMessage> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/chat/${projectId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: message.trim() }),
  })
  if (!res.ok) throw new Error('Failed to send message')
  return await res.json()
}

export async function markMessagesRead(projectId: string, _userId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders()
    await fetch(`${API_BASE}/api/chat/${projectId}/read`, {
      method: 'POST',
      headers,
    })
  } catch {
    // fire-and-forget — don't block UI
  }
}

export async function getUnreadCount(projectId: string, userId: string): Promise<number> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}/api/chat/${projectId}`, { headers })
    if (!res.ok) return 0
    const msgs: ProjectMessage[] = await res.json()
    return msgs.filter(m => !(m.read_by ?? []).includes(userId)).length
  } catch {
    return 0
  }
}
