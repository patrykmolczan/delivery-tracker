// api/chat.ts — Serverless proxy for AI Insights chat
// Accepts conversation history + structured data context, returns GPT-4o-mini response.
//
// SECURITY:
// - Requires a valid Supabase Bearer token (C-1 fix)
// - systemPrompt is built SERVER-SIDE from structured dataContext (H-4 fix)
//   The client no longer controls the prompt preamble — only the data payload.

import { requireAuth } from './lib/requireAuth'

// The fixed analyst preamble — lives on the server, not injectable by client
const SYSTEM_PREAMBLE = `You are an expert Delivery Project Management Assistant for a procurement and HR delivery tracker.
You have full access to the live project database. Answer any question a PM, manager, or analyst might ask — naturally, accurately, and concisely.

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
- For "show me" or "list" questions: show all items if <=10, otherwise show top 10 with a note.
- For trend questions: use the volumeByMonth data.
- For delivery time questions: use avgDeliveryDays from the relevant breakdown.
- Keep responses focused -- don't dump all data unless asked.
- If a question is ambiguous, answer the most likely interpretation and offer to clarify.`

function buildSystemPrompt(dataContext: Record<string, any>): string {
  const today = dataContext?.todayDate ?? new Date().toISOString().split('T')[0]
  return `${SYSTEM_PREAMBLE}

Today's date: ${today}

=== LIVE DATABASE SNAPSHOT ===
${JSON.stringify(dataContext, null, 2)}
=== END OF DATA ===`
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Require authenticated Supabase session (C-1)
  const auth = await requireAuth(req, res)
  if (!auth) return

  const apiKey = process.env.VITE_OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' })

  // Accept dataContext (structured object) + messages -- NOT a raw systemPrompt string (H-4)
  const { messages, dataContext } = req.body || {}
  if (!messages || !dataContext) {
    return res.status(400).json({ error: 'Missing messages or dataContext' })
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' })
  }

  const systemPrompt = buildSystemPrompt(dataContext)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `OpenAI error ${response.status}: ${errText}` })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return res.status(502).json({ error: 'Empty response from OpenAI' })

    return res.status(200).json({ content })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
