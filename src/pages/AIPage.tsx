import React, { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Sparkles, TrendingUp, Clock, BarChart2 } from 'lucide-react'
import type { Project, AIChatMessage } from '../types'
import { buildPredictionStats, predictDeliveryTime } from '../lib/data'
import type { PredictionStats } from '../lib/data'

interface Props {
  projects: Project[]
}

const SUGGESTED_QUESTIONS = [
  'How long does a typical delivery take?',
  'What is the average delivery time for Healthcare projects?',
  'Which countries have the fastest turnaround?',
  'How does job count affect delivery time?',
  'What are the current at-risk projects?',
  'Which client types take longest to deliver?',
]

function generateResponse(
  message: string,
  projects: Project[],
  stats: PredictionStats
): string {
  const q = message.toLowerCase()

  // Prediction with specifics
  const clientTypeMatch = Object.keys(stats.byClientType).find(ct => q.includes(ct.toLowerCase()))
  const industryMatch = Object.keys(stats.byIndustry).find(ind => q.includes(ind.toLowerCase()))
  const countryMatch = Object.keys(stats.byCountry).find(c => q.includes(c.toLowerCase()))
  const jobNumMatch = q.match(/(\d+)\s*jobs?/)
  const jobCount = jobNumMatch ? parseInt(jobNumMatch[1]) : undefined

  // Greeting
  if (q.match(/^(hi|hello|hey|howdy)/)) {
    return `👋 Hello! I'm your Delivery Insights Agent, trained on **${stats.overall.count} completed deliveries**.

I can help you:
- **Predict delivery times** for new projects
- **Analyze trends** by client type, industry, or country
- **Identify at-risk projects** based on history
- **Compare performance** across teams and clients

What would you like to know?`
  }

  // Average / typical delivery
  if (q.includes('average') || q.includes('typical') || q.includes('how long') || q.includes('usual')) {
    if (clientTypeMatch || industryMatch || countryMatch || jobCount) {
      const pred = predictDeliveryTime(stats, clientTypeMatch, industryMatch, countryMatch, jobCount)
      let resp = `Based on historical data:\n\n**Estimated delivery time: ${pred.estimate} days**\n\nFactors considered:\n- ${pred.breakdown}\n\nConfidence: **${pred.confidence}**`
      if (countryMatch && stats.byCountry[countryMatch]) {
        const cs = stats.byCountry[countryMatch]
        resp += `\n\n📍 ${countryMatch} specifically: avg **${cs.avg} days** across ${cs.count} projects`
      }
      if (industryMatch && stats.byIndustry[industryMatch]) {
        const is = stats.byIndustry[industryMatch]
        resp += `\n\n🏭 ${industryMatch} industry: avg **${is.avg} days** across ${is.count} projects`
      }
      return resp
    }
    return `📊 **Overall Delivery Statistics** (from ${stats.overall.count} completed projects):\n\n- **Average:** ${stats.overall.avg} days\n- **Median:** ${stats.overall.median} days\n\nWant a more specific estimate? Tell me the client type, industry, country, or number of jobs!`
  }

  // Fastest / best
  if (q.includes('fastest') || q.includes('quickest') || q.includes('best') || q.includes('shortest')) {
    if (q.includes('country') || q.includes('countries')) {
      const sorted = (Object.entries(stats.byCountry) as [string, {avg: number; count: number}][])
        .filter(([, v]) => v.count >= 3)
        .sort(([, a], [, b]) => a.avg - b.avg)
        .slice(0, 5)
      return `🏆 **Fastest Countries** (minimum 3 projects):\n\n${sorted.map(([c, v], i) => `${i + 1}. **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
    }
    if (q.includes('industry') || q.includes('industries')) {
      const sorted = (Object.entries(stats.byIndustry) as [string, {avg: number; count: number}][])
        .filter(([, v]) => v.count >= 3)
        .sort(([, a], [, b]) => a.avg - b.avg)
        .slice(0, 5)
      return `🏆 **Fastest Industries**:\n\n${sorted.map(([c, v], i) => `${i + 1}. **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
    }
    if (q.includes('client')) {
      const sorted = (Object.entries(stats.byClientType) as [string, {avg: number; count: number}][])
        .filter(([, v]) => v.count >= 3)
        .sort(([, a], [, b]) => a.avg - b.avg)
        .slice(0, 5)
      return `🏆 **Fastest Client Types**:\n\n${sorted.map(([c, v], i) => `${i + 1}. **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
    }
  }

  // Slowest / longest
  if (q.includes('slowest') || q.includes('longest') || q.includes('worst')) {
    if (q.includes('country') || q.includes('countries')) {
      const sorted = (Object.entries(stats.byCountry) as [string, {avg: number; count: number}][])
        .filter(([, v]) => v.count >= 3)
        .sort(([, a], [, b]) => b.avg - a.avg)
        .slice(0, 5)
      return `⚠️ **Slowest Countries** (minimum 3 projects):\n\n${sorted.map(([c, v], i) => `${i + 1}. **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
    }
    if (q.includes('industry')) {
      const sorted = (Object.entries(stats.byIndustry) as [string, {avg: number; count: number}][])
        .filter(([, v]) => v.count >= 3)
        .sort(([, a], [, b]) => b.avg - a.avg)
        .slice(0, 5)
      return `⚠️ **Slowest Industries**:\n\n${sorted.map(([c, v], i) => `${i + 1}. **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
    }
  }

  // At-risk / overdue
  if (q.includes('risk') || q.includes('overdue') || q.includes('late') || q.includes('behind')) {
    const today = new Date().toISOString().slice(0, 10)
    const atRisk = projects.filter(p =>
      !['Completed', 'Cancelled'].includes(p.status) &&
      p.expected_delivery_date &&
      p.expected_delivery_date < today
    )
    if (!atRisk.length) return `✅ Great news — no projects are currently past their expected delivery date!`

    const topRisk = atRisk
      .sort((a, b) => (a.expected_delivery_date || '') < (b.expected_delivery_date || '') ? -1 : 1)
      .slice(0, 5)

    return `🚨 **${atRisk.length} At-Risk Projects** (past expected delivery):\n\n${topRisk.map(p => {
      const days = Math.floor((new Date().getTime() - new Date(p.expected_delivery_date! + 'T00:00:00').getTime()) / 86400000)
      return `• **${p.client_name}** — ${days} days overdue (${p.project_owner})`
    }).join('\n')}${atRisk.length > 5 ? `\n\n...and ${atRisk.length - 5} more` : ''}`
  }

  // Job count impact
  if (q.includes('job') && (q.includes('count') || q.includes('number') || q.includes('affect') || q.includes('impact'))) {
    return `📊 **Job Count vs. Delivery Time**:\n\n${(Object.entries(stats.byJobRange) as [string, {avg: number; count: number}][])
      .filter(([, v]) => v.count > 0)
      .map(([range, v]) => `• **${range} jobs** — avg ${v.avg} days (${v.count} projects)`)
      .join('\n')}`
  }

  // Client type breakdown
  if (q.includes('client type') || q.includes('client types')) {
    const sorted = (Object.entries(stats.byClientType) as [string, {avg: number; count: number}][]).sort(([, a], [, b]) => b.count - a.count)
    return `👥 **Delivery Time by Client Type**:\n\n${sorted.map(([ct, v]) => `• **${ct}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
  }

  // Industry breakdown
  if (q.includes('industry') || q.includes('industries') || q.includes('sector')) {
    const sorted = (Object.entries(stats.byIndustry) as [string, {avg: number; count: number}][]).sort(([, a], [, b]) => b.count - a.count)
    return `🏭 **Delivery Time by Industry**:\n\n${sorted.map(([ind, v]) => `• **${ind}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
  }

  // Country breakdown
  if (q.includes('country') || q.includes('countries') || q.includes('region')) {
    const sorted = (Object.entries(stats.byCountry) as [string, {avg: number; count: number}][])
      .filter(([, v]) => v.count >= 2)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
    return `🌍 **Top Countries by Volume**:\n\n${sorted.map(([c, v]) => `• **${c}** — avg ${v.avg} days (${v.count} projects)`).join('\n')}`
  }

  // Status summary
  if (q.includes('status') || q.includes('active') || q.includes('in progress') || q.includes('current')) {
    const active = projects.filter(p => !['Completed', 'Cancelled'].includes(p.status))
    const byStatus: Record<string, number> = {}
    projects.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1 })
    return `📋 **Current Project Status Summary**:\n\n${Object.entries(byStatus).map(([s, c]) => `• **${s}**: ${c}`).join('\n')}\n\n**${active.length} projects** are currently active.`
  }

  // Default / fallback with prediction attempt
  if (clientTypeMatch || industryMatch || countryMatch || jobCount) {
    const pred = predictDeliveryTime(stats, clientTypeMatch, industryMatch, countryMatch, jobCount)
    return `Based on your question, here's my best estimate:\n\n**Predicted delivery time: ~${pred.estimate} days** (${pred.confidence} confidence)\n\n${pred.breakdown ? `_Based on: ${pred.breakdown}_` : ''}\n\nIs there something more specific you'd like to know?`
  }

  return `I can help you analyze delivery performance across ${stats.overall.count} completed projects. Here are some things I can answer:

- **Delivery time predictions** — "How long for a Healthcare project in Germany?"
- **Performance comparisons** — "Which industries are fastest?"
- **Risk analysis** — "What projects are overdue?"
- **Trend analysis** — "How does job count affect delivery time?"

What would you like to explore?`
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/^• (.+)$/gm, '<li class="ml-3">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-3">$2</li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')
}

export const AIPage: React.FC<Props> = ({ projects }) => {
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<PredictionStats | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (projects.length > 0) {
      const s = buildPredictionStats(projects)
      setStats(s)
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `👋 Hello! I'm your **Delivery Insights Agent**, powered by **${s.overall.count} completed deliveries**.

I can predict delivery timelines, analyze performance trends, and help you understand your data.

**Overall stats:**
- Average delivery time: **${s.overall.avg} days**
- Median: **${s.overall.median} days**

Ask me anything — or try one of the suggested questions below!`,
        timestamp: new Date(),
      }])
    }
  }, [projects])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || !stats) return

    const userMsg: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }

    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    // Small delay for natural feel
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600))

    const response = generateResponse(msg, projects, stats)
    const assistantMsg: AIChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    }

    setMessages(m => [...m, assistantMsg])
    setLoading(false)
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
            Trained on {stats?.overall.count || 0} completed deliveries · Avg {stats?.overall.avg || 0} days
          </p>
        </div>
        <div className="flex gap-2">
          <div className="stats stats-horizontal shadow bg-base-200 border border-base-300 hidden md:flex">
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><TrendingUp size={10} /> Avg Days</div>
              <div className="stat-value text-sm">{stats?.overall.avg || '—'}</div>
            </div>
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><BarChart2 size={10} /> Median</div>
              <div className="stat-value text-sm">{stats?.overall.median || '—'}</div>
            </div>
            <div className="stat py-2 px-4">
              <div className="stat-title text-xs flex items-center gap-1"><Clock size={10} /> Projects</div>
              <div className="stat-value text-sm">{stats?.overall.count || '—'}</div>
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
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 mb-3">
          <p className="text-xs text-base-content/40 mb-2 font-medium">SUGGESTED QUESTIONS</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                className="btn btn-ghost btn-xs border border-base-300 text-xs h-auto py-1.5 px-3 normal-case text-left"
                onClick={() => sendMessage(q)}
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
          placeholder="Ask anything about delivery times, trends, or predictions..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
        />
        <button
          className={`btn btn-primary gap-2 ${loading ? 'loading' : ''}`}
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          {!loading && <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
