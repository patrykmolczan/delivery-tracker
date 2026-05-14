import { supabase } from './supabase'

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
  const { data, error } = await supabase
    .from('project_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function sendMessage(
  projectId: string,
  senderId: string,
  senderName: string,
  senderRole: string,
  message: string
): Promise<ProjectMessage> {
  const { data, error } = await supabase
    .from('project_messages')
    .insert({
      project_id: projectId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      message: message.trim(),
      read_by: [senderId],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markMessagesRead(projectId: string, userId: string): Promise<void> {
  const { data: msgs } = await supabase
    .from('project_messages')
    .select('id, read_by')
    .eq('project_id', projectId)
  if (!msgs || msgs.length === 0) return
  const unread = msgs.filter((m: { id: string; read_by: string[] }) => !m.read_by.includes(userId))
  if (unread.length === 0) return
  await Promise.all(
    unread.map((m: { id: string; read_by: string[] }) =>
      supabase
        .from('project_messages')
        .update({ read_by: [...m.read_by, userId] })
        .eq('id', m.id)
    )
  )
}

export async function getUnreadCount(projectId: string, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('project_messages')
    .select('id, read_by')
    .eq('project_id', projectId)
  if (error || !data) return 0
  return data.filter((m: { id: string; read_by: string[] }) => !m.read_by.includes(userId)).length
}
