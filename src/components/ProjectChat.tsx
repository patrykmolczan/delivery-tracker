import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { supabaseRealtime } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchMessages,
  sendMessage as sendChatMessage,
  markMessagesRead,
} from '../lib/chat'
import type { ProjectMessage } from '../lib/chat'
import {
  createNotification,
  createNotificationsForAdmins,
} from '../lib/data'

interface Props {
  projectId: string
  projectName: string
  projectOwnerId: string | null
  onUnreadCountChange?: (count: number) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
}

export const ProjectChat: React.FC<Props> = ({
  projectId,
  projectName,
  projectOwnerId,
  onUnreadCountChange,
}) => {
  const { user, isAdmin } = useAuth()
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }

  const load = useCallback(async () => {
    try {
      const msgs = await fetchMessages(projectId)
      setMessages(msgs)
      if (user?.id) {
        await markMessagesRead(projectId, user.id)
        onUnreadCountChange?.(0)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [projectId, user?.id, onUnreadCountChange])

  useEffect(() => {
    load()
  }, [load])

  // Scroll to bottom once loaded
  useEffect(() => {
    if (!loading) {
      scrollToBottom(false)
    }
  }, [loading])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages.length])

  // Realtime subscription — uses supabaseRealtime (autoRefreshToken: false, no navigator.lock)
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('chat_' + projectId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newMsg = payload.new as ProjectMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          if (user?.id && newMsg.sender_id !== user.id) {
            markMessagesRead(projectId, user.id).catch(() => {})
            onUnreadCountChange?.(0)
          }
        }
      )
      .subscribe()

    return () => {
      supabaseRealtime.removeChannel(channel)
    }
  }, [projectId, user?.id, onUnreadCountChange])

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setError(null)
    try {
      const senderName =
        (user as any)?.user_metadata?.full_name || user.email || 'User'
      const senderRole = isAdmin ? 'admin' : 'user'
      const msg = await sendChatMessage(projectId, user.id, senderName, senderRole, text)
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // Fire in-app notifications
      if (isAdmin) {
        if (projectOwnerId && projectOwnerId !== user.id) {
          createNotification({
            userId: projectOwnerId,
            type: 'chat_message',
            title: 'New message from admin',
            body: `${senderName}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
            projectId,
            projectName,
          }).catch(() => {})
        }
      } else {
        createNotificationsForAdmins({
          type: 'chat_message',
          title: `Message from ${senderName}`,
          body: `${senderName}: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
          projectId,
          projectName,
          excludeUserId: user.id,
        }).catch(() => {})
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
      setInput(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-primary/50" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-base-content/30 pt-16">
            <MessageSquare size={32} className="opacity-30" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs">Start the conversation below</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === user?.id
            const prevMsg = messages[i - 1]
            const nextMsg = messages[i + 1]
            const showName =
              !isMe &&
              (i === 0 || prevMsg?.sender_id !== msg.sender_id)
            const showTime =
              i === messages.length - 1 ||
              nextMsg?.sender_id !== msg.sender_id

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${showName ? 'mt-3' : 'mt-0.5'}`}
              >
                {/* Sender name + role badge — left side only, first in group */}
                {showName && (
                  <div className="flex items-center gap-1.5 mb-1 ml-1">
                    <span className="text-xs font-semibold text-base-content/70">
                      {msg.sender_name}
                    </span>
                    {(msg.sender_role === 'admin' ||
                      msg.sender_role === 'super_admin') && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20">
                        Admin
                      </span>
                    )}
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                    isMe
                      ? 'bg-primary text-primary-content rounded-2xl rounded-br-sm'
                      : 'bg-base-200 text-base-content rounded-2xl rounded-bl-sm'
                  }`}
                >
                  {msg.message}
                </div>

                {/* Timestamp — last in group */}
                {showTime && (
                  <span
                    className="text-[10px] text-base-content/30 mt-1 mx-1"
                    title={formatTimestamp(msg.created_at)}
                  >
                    {timeAgo(msg.created_at)}
                  </span>
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 text-xs text-error text-center">{error}</div>
      )}

      {/* Input bar */}
      <div className="border-t border-base-300 px-3 py-3 bg-base-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 input input-bordered input-sm rounded-full text-sm"
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            maxLength={2000}
            autoFocus
          />
          <button
            className={`btn btn-primary btn-sm btn-circle flex-shrink-0 ${sending ? 'loading' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            {!sending && <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
