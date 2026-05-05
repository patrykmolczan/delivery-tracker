import { requireAuth } from './lib/requireAuth'

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Require authenticated Supabase session (C-1)
  const auth = await requireAuth(req, res)
  if (!auth) return

  const apiKey = process.env.VITE_OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured on server' })

  const { titles } = req.body || {}
  if (!titles || !Array.isArray(titles) || titles.length === 0) {
    return res.status(400).json({ error: 'Missing or empty titles array' })
  }

  // Deduplicate, cap at 50, and filter out annotation rows that aren't real job titles
  const isJobTitle = (t: string) => {
    const s = t.trim()
    if (!s || s.length < 3) return false
    // Skip obvious annotation patterns: contains a colon with location info, or is a single generic word
    if (/:\s/.test(s)) return false               // e.g. "Rocket City: Huntsville, AL"
    if (/^(region|category|note|section|group|header|subtotal|total)$/i.test(s)) return false
    return true
  }
  const unique: string[] = [...new Set((titles as string[]).filter(isJobTitle))].slice(0, 50)

  if (unique.length === 0) {
    return res.status(200).json({ descriptions: {} })
  }

  const systemPrompt = `You are an expert HR compensation analyst writing professional job descriptions for Pay Intel rate card templates used across all industries globally.

For EACH job title provided, write a concise professional description following this exact structure (all in one text block, no section headers):
1. Opening paragraph (2–3 sentences): what the role is and its main purpose, written in third person starting with "The [Title] is responsible for..."
2. Responsibilities paragraph (2–3 sentences): key day-to-day activities the person performs
3. Requirements paragraph (2–3 sentences): required education, experience, and certifications

Then on a new line write "Skills:" followed by 6–8 specific skills as bullet points, each starting with "- ".

Rules:
- Keep each description under 250 words total
- Descriptions must be broadly applicable across all industries globally
- Be specific about tools, technologies, and methodologies typical for the role
- Write in third person throughout
- Output ONLY valid JSON in this exact format:
  { "descriptions": { "Exact Job Title As Given": "full description text here", ... } }
- Include EXACTLY one entry per input title, keyed by the exact title string provided`

  const userPrompt = `Generate job descriptions for these job titles:\n${JSON.stringify(unique)}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: Math.max(1500, 600 * unique.length),
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `OpenAI error ${response.status}: ${errText}` })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return res.status(502).json({ error: 'Empty response from OpenAI' })

    let parsed: { descriptions?: Record<string, string> }
    try {
      // Strip markdown code fences if model wrapped the JSON (e.g. ```json ... ```)
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return res.status(502).json({ error: 'Invalid JSON from OpenAI', raw: content.slice(0, 300) })
    }

    return res.status(200).json({ descriptions: parsed.descriptions ?? {} })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
