// api/analyze-template.ts — Template quality analysis via GPT-4.1
//
// SECURITY:
// - Requires a valid Supabase Bearer token (C-1 fix)
// - systemPrompt is embedded SERVER-SIDE (H-4 fix) — client sends only userPrompt (template data)

import { requireAuth } from './lib/requireAuth'

// Fixed analyst system prompt — not injectable by the client
const SYSTEM_PROMPT = `You are a Senior Compensation Data Quality Analyst at a global HR consulting firm. You specialize in reviewing Pay Intelligence (pay equity/benchmarking) data templates before submission to the Pay Intel platform.

Return ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "overallScore": <int 0-100>,
  "issueCount": { "critical": <int>, "warning": <int>, "info": <int> },
  "duplicates": [
    {
      "titles": ["<title1>", "<title2>"],
      "reason": "<why they are duplicates>",
      "suggestion": "<recommended single title to keep>",
      "severity": "critical" | "warning"
    }
  ],
  "levelingIssues": [
    {
      "jobTitle": "<title>",
      "issue": "<specific issue description>",
      "suggestion": "<what to do>",
      "severity": "critical" | "warning" | "info"
    }
  ],
  "missingDataRows": [
    {
      "rowIndex": <int>,
      "jobTitle": "<title>",
      "missing": ["description" | "country" | "state/province"],
      "severity": "critical" | "warning"
    }
  ],
  "locationIssues": [
    {
      "rowIndex": <int>,
      "jobTitle": "<title>",
      "issue": "<e.g. Missing country — required for benchmarking accuracy>",
      "severity": "critical" | "warning"
    }
  ]
}

Rules:
- duplicates: only flag clear semantic duplicates; don't flag different seniority levels of the same title as duplicates (Sr. Engineer vs Engineer is expected)
- levelingIssues: flag ANY job title that contains a level modifier (Jr., Sr., Senior, Junior, II, III, IV, Lead as modifier, Staff as modifier, Principal as modifier, SME, Associate as entry-level modifier, Mid-Level, Entry-Level). These should be removed — Pay Intel delivers all 5 levels automatically. EXCEPTION: do NOT flag titles where the level IS the job (Manager, Director, VP, Head of, Senior Manager, Senior Director, C-suite, Team Lead). For each flagged title, provide the clean base title as the suggestion.
- missingDataRows: ONLY include rows where country is blank/empty OR state/province is blank/empty OR description is blank/empty. Country and State/Province are both required fields. Do NOT include rows where only the Job Title column has data and all other fields are blank — those are annotation rows, not data rows.
- locationIssues: flag rows missing country; flag rows where state/province is blank or contains a region/metro name instead of an actual state (e.g. "Bay Area" -> flag and suggest "California"). Do NOT re-flag multi-location rows — those are handled separately. Do NOT suggest "remote" as a valid state/province value.
- Be concise in messages — max 120 chars per message field
- overallScore: start at 100, subtract: 15 per critical duplicate group, 10 per warning duplicate, 5 per missing description row (max -30 total for descriptions), 10 per missing country row (max -20), 8 per leveling issue (title contains unnecessary level modifier that Pay Intel handles automatically)
- issueCount: sum all items across all categories by their severity field`

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require authenticated Supabase session (C-1)
  const auth = await requireAuth(req, res)
  if (!auth) return

  const apiKey = process.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured on server' })
  }

  // Client sends only the template data (userPrompt) — systemPrompt is built server-side (H-4)
  const { userPrompt } = req.body || {}
  if (!userPrompt) {
    return res.status(400).json({ error: 'Missing userPrompt' })
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `OpenAI error ${response.status}: ${errText}` })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return res.status(502).json({ error: 'Empty response from OpenAI' })
    }

    return res.status(200).json({ content })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
