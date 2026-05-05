import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Bot, User, Sparkles, TrendingUp, Clock, BarChart2, RefreshCw } from 'lucide-react'
import type { Project, AIChatMessage } from '../types'
import { getAuthHeaders } from '../lib/supabase'

interface Props {
  projects: Project[]
}

// ─── Data context builder ──────────────────────────────────────────────────────
// Builds a rich summary of all project data to pass to GPT as context.
// GPT uses this to answer any natural-language question about the data.

interface AnalystStats {
  total: number
  byStatus: Record<string, number>
  avgDeliveryDays: number | null
  activeProjects: Array<{
    idNumber: number | null
    client: string
    projectType: string | null
    status: string
    dateReceived: string | null
    expectedDate: string | null
    daysOpen: number | null
  }>
  overdueCount: number
}

interface DataContext {
  generatedAt: string
  todayDate: string
  overall: {
    total: number
    byStatus: Record<string, number>
    avgDeliveryDays: number
    medianDeliveryDays: number
  }
  byAnalyst: Record<string, AnalystStats>
  unassigned: {
    total: number
    byStatus: Record<string, number>
  }
  byClientType: Record<string, { total: number; byStatus: Record<string, number>; avgDays: number | null }>
  byProjectType: Record<string, { total: number; byStatus: Record<string, number>; avgDays: number | null }>
  topClients: Array<{ name: string; total: number; completed: number; inProcess: number; avgDays: number | null }>
  overdueProjects: Array<{
    idNumber: number | null
    client: string
    analyst: string | null
    owner: string | null
    requestor: string | null
    daysOverdue: number
    expectedDate: string
    projectType: string | null
  }>
  inProgressProjects: Array<{
    idNumber: number | null
    client: string
    analyst: string | null
    owner: string | null
    requestor: string | null
    projectType: string | null
    dateReceived: string | null
    expectedDate: string | null
    daysOpen: number | null
  }>
  onHoldProjects: Array<{
    idNumber: number | null
    client: string
    analyst: string | null
    projectType: string | null
    dateReceived: string | null
  }>
  recentCompletions: Array<{
    idNumber: number | null
    client: string
    analyst: string | null
    projectType: string | null
    daysToComplete: number | null
    dateDelivered: string
  }>
  volumeByMonth: Record<string, number>
}

function buildDataContext(projects: Project[]): DataContext {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const todayMs = today.getTime()

  const ctx: DataContext = {
    generatedAt: new Date().toISOString(),
    todayDate: todayStr,
    overall: { total: projects.length, byStatus: {}, avgDeliveryDays: 0, medianDeliveryDays: 0 },
    byAnalyst: {},
    unassigned: { total: 0, byStatus: {} },
    byClientType: {},
    byProjectType: {},
    topClients: [],
    overdueProjects: [],
    inProgressProjects: [],
    onHoldProjects: [],
    recentCompletions: [],
    volumeByMonth: {},
  }

  const completedDays: number[] = []
  const clientMap: Record<string, { total: number; completed: number; inProcess: number; days: number[] }> = {}
  const thirtyDaysAgo = new Date(todayMs - 30 * 86400000).toISOString().slice(0, 10)
  const twelveMonthsAgo = new Date(todayMs - 365 * 86400000).toISOString().slice(0, 10)

  for (const p of projects) {
    // Status counts
    ctx.overall.byStatus[p.status] = (ctx.overall.byStatus[p.status] || 0) + 1

    // Analyst bucketing
    const analyst = p.analyst?.trim() || null
    if (analyst) {
      if (!ctx.byAnalyst[analyst]) {
        ctx.byAnalyst[analyst] = { total: 0, byStatus: {}, avgDeliveryDays: null, activeProjects: [], overdueCount: 0 }
      }
      ctx.byAnalyst[analyst].total++
      ctx.byAnalyst[analyst].byStatus[p.status] = (ctx.byAnalyst[analyst].byStatus[p.status] || 0) + 1
    } else {
      ctx.unassigned.total++
      ctx.unassigned.byStatus[p.status] = (ctx.unassigned.byStatus[p.status] || 0) + 1
    }

    // Client type
    if (p.client_type) {
      if (!ctx.byClientType[p.client_type]) ctx.byClientType[p.client_type] = { total: 0, byStatus: {}, avgDays: null }
      ctx.byClientType[p.client_type].total++
      ctx.byClientType[p.client_type].byStatus[p.status] = (ctx.byClientType[p.client_type].byStatus[p.status] || 0) + 1
    }

    // Project type
    if (p.project_type) {
      if (!ctx.byProjectType[p.project_type]) ctx.byProjectType[p.project_type] = { total: 0, byStatus: {}, avgDays: null }
      ctx.byProjectType[p.project_type].total++
      ctx.byProjectType[p.project_type].byStatus[p.status] = (ctx.byProjectType[p.project_type].byStatus[p.status] || 0) + 1
    }

    // Client totals
    const clientName = p.client_name?.trim() || 'Unknown'
    if (!clientMap[clientName]) clientMap[clientName] = { total: 0, completed: 0, inProcess: 0, days: [] }
    clientMap[clientName].total++
    if (p.status === 'Completed') clientMap[clientName].completed++
    if (p.status === 'In Process') clientMap[clientName].inProcess++

    // Delivery days (completed only)
    if (p.status === 'Completed' && p.days_to_complete != null) {
      const d = p.days_to_complete as number
      completedDays.push(d)
      clientMap[clientName].days.push(d)
      if (analyst && ctx.byAnalyst[analyst]) {
        // collect for avg later
        const bucket = ctx.byAnalyst[analyst] as AnalystStats & { _days?: number[] }
        if (!bucket._days) bucket._days = []
        bucket._days.push(d)
      }
      if (p.client_type && ctx.byClientType[p.client_type]) {
        const bucket = ctx.byClientType[p.client_type] as typeof ctx.byClientType[string] & { _days?: number[] }
        if (!bucket._days) bucket._days = []
        bucket._days.push(d)
      }
      if (p.project_type && ctx.byProjectType[p.project_type]) {
        const bucket = ctx.byProjectType[p.project_type] as typeof ctx.byProjectType[string] & { _days?: number[] }
        if (!bucket._days) bucket._days = []
        bucket._days.push(d)
      }
    }

    // Monthly volume (received date, last 12 months)
    if (p.date_received && p.date_received >= twelveMonthsAgo) {
      const month = p.date_received.slice(0, 7)
      ctx.volumeByMonth[month] = (ctx.volumeByMonth[month] || 0) + 1
    }

    // Active project details for analyst
    if (!['Completed', 'Cancelled'].includes(p.status) && analyst && ctx.byAnalyst[analyst]) {
      const daysOpen = p.date_received
        ? Math.floor((todayMs - new Date(p.date_received + 'T00:00:00').getTime()) / 86400000)
        : null
      if (ctx.byAnalyst[analyst].activeProjects.length < 25) {
        ctx.byAnalyst[analyst].activeProjects.push({
          idNumber: p.id_number ?? null,
          client: p.client_name || 'Unknown',
          projectType: p.project_type || null,
          status: p.status,
          dateReceived: p.date_received || null,
          expectedDate: p.expected_delivery_date || null,
          daysOpen,
        })
      }
    }

    // Overdue projects
    if (
      !['Completed', 'Cancelled'].includes(p.status) &&
      p.expected_delivery_date &&
      p.expected_delivery_date < todayStr
    ) {
      const daysOverdue = Math.floor((todayMs - new Date(p.expected_delivery_date + 'T00:00:00').getTime()) / 86400000)
      if (analyst && ctx.byAnalyst[analyst]) ctx.byAnalyst[analyst].overdueCount++
      ctx.overdueProjects.push({
        idNumber: p.id_number ?? null,
        client: p.client_name || 'Unknown',
        analyst: analyst,
        owner: p.project_owner || null,
        requestor: p.requestor || null,
        daysOverdue,
        expectedDate: p.expected_delivery_date,
        projectType: p.project_type || null,
      })
    }

    // In-progress
    if (p.status === 'In Process') {
      const daysOpen = p.date_received
        ? Math.floor((todayMs - new Date(p.date_received + 'T00:00:00').getTime()) / 86400000)
        : null
      ctx.inProgressProjects.push({
        idNumber: p.id_number ?? null,
        client: p.client_name || 'Unknown',
        analyst: analyst,
        owner: p.project_owner || null,
        requestor: p.requestor || null,
        projectType: p.project_type || null,
        dateReceived: p.date_received || null,
        expectedDate: p.expected_delivery_date || null,
        daysOpen,
      })
    }

    // On hold
    if (p.status === 'On Hold') {
      ctx.onHoldProjects.push({
        idNumber: p.id_number ?? null,
        client: p.client_name || 'Unknown',
        analyst: analyst,
        projectType: p.project_type || null,
        dateReceived: p.date_received || null,
      })
    }

    // Recent completions (last 30 days)
    if (p.status === 'Completed' && p.date_delivered && p.date_delivered >= thirtyDaysAgo) {
      ctx.recentCompletions.push({
        idNumber: p.id_number ?? null,
        client: p.client_name || 'Unknown',
        analyst: analyst,
        projectType: p.project_type || null,
        daysToComplete: p.days_to_complete != null ? (p.days_to_complete as number) : null,
        dateDelivered: p.date_delivered,
      })
    }
  }

  // Compute overall avg/median
  if (completedDays.length > 0) {
    ctx.overall.avgDeliveryDays = Math.round(completedDays.reduce((a, b) => a + b, 0) / completedDays.length * 10) / 10
    const sorted = [...completedDays].sort((a, b) => a - b)
    ctx.overall.medianDeliveryDays = sorted[Math.floor(sorted.length / 2)]
  }

  // Compute analyst avg days
  for (const name of Object.keys(ctx.byAnalyst)) {
    const bucket = ctx.byAnalyst[name] as AnalystStats & { _days?: number[] }
    if (bucket._days && bucket._days.length > 0) {
      bucket.avgDeliveryDays = Math.round(bucket._days.reduce((a, b) => a + b, 0) / bucket._days.length * 10) / 10
      delete bucket._days
    }
  }

  // Compute client type avg days
  for (const ct of Object.keys(ctx.byClientType)) {
    const bucket = ctx.byClientType[ct] as typeof ctx.byClientType[string] & { _days?: number[] }
    if (bucket._days && bucket._days.length > 0) {
      bucket.avgDays = Math.round(bucket._days.reduce((a, b) => a + b, 0) / bucket._days.length * 10) / 10
      delete bucket._days
    }
  }

  // Compute project type avg days
  for (const pt of Object.keys(ctx.byProjectType)) {
    const bucket = ctx.byProjectType[pt] as typeof ctx.byProjectType[string] & { _days?: number[] }
    if (bucket._days && bucket._days.length > 0) {
      bucket.avgDays = Math.round(bucket._days.reduce((a, b) => a + b, 0) / bucket._days.length * 10) / 10
      delete bucket._days
    }
  }

  // Top 30 clients by volume
  ctx.topClients = Object.entries(clientMap)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 30)
    .map(([name, v]) => ({
      name,
      total: v.total,
      completed: v.completed,
      inProcess: v.inProcess,
      avgDays: v.days.length > 0 ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length * 10) / 10 : null,
    }))

  // Sort overdue by most overdue first
  ctx.overdueProjects.sort((a, b) => b.daysOverdue - a.daysOverdue)

  // Sort in-progress by oldest first
  ctx.inProgressProjects.sort((a, b) => {
    if (!a.dateReceived) return 1
    if (!b.dateReceived) return -1
    return a.dateReceived < b.dateReceived ? -1 : 1
  })

  // Sort recent completions by date desc
  ctx.recentCompletions.sort((a, b) => b.dateDelivered.localeCompare(a.dateDelivered))

  return ctx
}

function buildSystemPrompt(ctx: DataContext): string {
  return `You are an expert Delivery Project Management Assistant for a procurement and HR delivery tracker.
You have full access to the live project database. Answer any question a PM, manager, or analyst might ask — naturally, accurately, and concisely.

Today's date: ${ctx.todayDate}

=== LIVE DATABASE SNAPSHOT ===
${JSON.stringify(ctx, null, 2)}
=== END OF DATA ===

SCHEMA LEGEND — understand these fields before answering:
- "Client" or "client_name": the actual company/organization name (e.g. "NYCHH", "Johnson & Johnson", "Amazon"). Use the "topClients" array in the data. NEVER use byClientType for client name questions.
- "Client Type" or "client_type": a category/segment bucket (e.g. "Existing Client", "New Client", "MSP", "Direct"). Use the "byClientType" object. These are NOT company names — they are categories.
- "Analyst": the internal team member assigned to deliver the project (Joanna, Kim, Allie, Megan, Patryk, Tricia). Use the "byAnalyst" object.
- "Project Owner" or "owner": the client-side owner/sponsor of the project.
- "Requestor": the person who submitted the request.
- "Status": Completed | In Process | On Hold | Overdue | Cancelled.
- "Days to complete" (days_to_complete): calendar days from Date Received to Date Delivered. Negative = delivered early. Positive = delivered late.
- "Project Type": type of delivery work (e.g. "Pay Intel (Rate Card)", "Pay Intel (Right Sourcing)", "Magnit VMS").

INSTRUCTIONS:
- Answer based strictly on the data above. Do not guess or make up numbers.
- Be conversational but precise. Give exact counts, names, and dates when asked.
- Format responses with markdown: **bold** for key numbers/names, bullet lists for multiple items, tables when comparing data.
- For analyst questions: include their project count, active workload, avg delivery time, and overdue items.
- For "client" or "which client" questions: ALWAYS use topClients (real company names) unless the user explicitly says "client type" or "client category".
- For "show me" or "list" questions: show all items if ≤10, otherwise show top 10 with a note.
- For trend questions: use the volumeByMonth data.
- For delivery time questions: use avgDeliveryDays from the relevant breakdown.
- Keep responses focused — don't dump all data unless asked.
- If a question is ambiguous, answer the most likely interpretation and offer to clarify.`
}

// ─── Suggested questions ───────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'How many projects does Joanna have?',
  'What projects are currently in progress?',
  'Who has the most active projects right now?',
  'Are there any overdue projects?',
  'What is the average delivery time?',
  'Which client sends us the most work?',
  'Show me all projects on hold',
  'How many projects were completed this month?',
  'Which analyst has the fastest delivery time?',
  'What are the current project counts by status?',
]

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```[\s\S]*?```/g, m => `<pre class="bg-base-300 rounded p-2 text-xs overflow-x-auto my-2 whitespace-pre-wrap">${m.slice(3, -3).replace(/^[^\n]*\n/, '')}</pre>`)
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Tables (basic)
    .replace(/^\|(.+)\|$/gm, '<tr>' + '$1'.split('|').map(c => `<td class="px-2 py-1 border border-base-300 text-xs">${c.trim()}</td>`).join('') + '</tr>')
    // Bullet lists
    .replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-sm mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-base mt-3 mb-1">$1</h2>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')
}

// ─── Main component ────────────────────────────────────────────────────────────

export const AIPage: React.FC<Props> = ({ projects }) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataCtx, setDataCtx] = useState<DataContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Keep last 10 messages for multi-turn context (saves tokens)
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  useEffect(() => {
    if (projects.length > 0) {
      const ctx = buildDataContext(projects)
      setDataCtx(ctx)
      const completedCount = ctx.overall.byStatus['Completed'] || 0
      const activeCount = (ctx.overall.byStatus['In Process'] || 0) + (ctx.overall.byStatus['On Hold'] || 0)
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm your **Delivery Insights Agent** — I have full access to all **${ctx.overall.total.toLocaleString()} projects** in the database.\n\nRight now:\n- **${activeCount} active** projects (${ctx.overall.byStatus['In Process'] || 0} in process, ${ctx.overall.byStatus['On Hold'] || 0} on hold)\n- **${ctx.overdueProjects.length} overdue** projects\n- **${ctx.overall.avgDeliveryDays} days** average delivery time (from ${completedCount.toLocaleString()} completed)\n\nAsk me anything — analyst workloads, client volumes, delivery trends, overdue items, or anything else about your data.`,
        timestamp: new Date(),
      }])
    }
  }, [projects])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || !dataCtx || loading) return

    setError(null)
    const userMsg: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    // Append to history
    historyRef.current.push({ role: 'user', content: msg })
    // Keep last 10 exchanges
    if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20)

    try {
      const chatHeaders = await getAuthHeaders()
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: chatHeaders,
        body: JSON.stringify({
          systemPrompt: buildSystemPrompt(dataCtx),
          // Send last 10 messages for multi-turn context
          messages: historyRef.current.slice(-10),
        }),
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
        throw new Error(errData.error || `HTTP ${resp.status}`)
      }

      const { content } = await resp.json()
      historyRef.current.push({ role: 'assistant', content })

      const assistantMsg: AIChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }
      setMessages(m => [...m, assistantMsg])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errMsg)
      historyRef.current.pop() // remove the failed user message from history
    } finally {
      setLoading(false)
    }
  }, [input, dataCtx, loading])

  const clearChat = () => {
    historyRef.current = []
    setError(null)
    if (dataCtx) {
      const completedCount = dataCtx.overall.byStatus['Completed'] || 0
      const activeCount = (dataCtx.overall.byStatus['In Process'] || 0) + (dataCtx.overall.byStatus['On Hold'] || 0)
      setMessages([{
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: `Chat cleared! Still have access to all **${dataCtx.overall.total.toLocaleString()} projects**.\n\n- **${activeCount} active** | **${dataCtx.overdueProjects.length} overdue** | **${dataCtx.overall.avgDeliveryDays}d** avg delivery (${completedCount.toLocaleString()} completed)\n\nWhat would you like to know?`,
        timestamp: new Date(),
      }])
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles size={22} className="text-primary" /> AI Delivery Agent
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">
            {dataCtx
              ? `Live access to ${dataCtx.overall.total.toLocaleString()} projects · Ask anything`
              : 'Loading project data…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm gap-1 text-base-content/50"
            onClick={clearChat}
            title="Clear conversation"
          >
            <RefreshCw size={14} /> Clear
          </button>
          <div className="stats stats-horizontal shadow bg-base-200 border border-base-300 hidden md:flex">
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><TrendingUp size={10} /> Avg Days</div>
              <div className="stat-value text-sm">{dataCtx?.overall.avgDeliveryDays ?? '—'}</div>
            </div>
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><BarChart2 size={10} /> Active</div>
              <div className="stat-value text-sm">
                {dataCtx ? ((dataCtx.overall.byStatus['In Process'] || 0) + (dataCtx.overall.byStatus['On Hold'] || 0)) : '—'}
              </div>
            </div>
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><Clock size={10} /> Overdue</div>
              <div className="stat-value text-sm text-error">{dataCtx?.overdueProjects.length ?? '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
              ${msg.role === 'assistant' ? 'bg-primary/20 text-primary' : 'bg-base-300 text-base-content'}`}>
              {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'assistant'
                ? 'bg-base-200 border border-base-300 rounded-tl-sm'
                : 'bg-primary text-primary-content rounded-tr-sm'}`}>
              {msg.role === 'assistant' ? (
                <div dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(msg.content)}</p>` }} />
              ) : (
                <p>{msg.content}</p>
              )}
              <p className={`text-xs mt-2 ${msg.role === 'assistant' ? 'text-base-content/30' : 'text-primary-content/50'}`}>
                {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-base-200 border border-base-300 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error text-sm py-2 px-4">
            <span>⚠ {error} — check your connection and try again.</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 mb-3">
          <p className="text-xs text-base-content/40 mb-2 font-medium tracking-wider">SUGGESTED QUESTIONS</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                className="btn btn-ghost btn-xs border border-base-300 text-xs h-auto py-1.5 px-3 normal-case text-left"
                onClick={() => sendMessage(q)}
                disabled={loading || !dataCtx}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2">
        <input
          className="input input-bordered flex-1"
          placeholder="Ask anything about projects, analysts, clients, delivery times…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading || !dataCtx}
        />
        <button
          className={`btn btn-primary gap-2 ${loading ? 'loading' : ''}`}
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || !dataCtx}
        >
          {!loading && <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
