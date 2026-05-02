export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.VITE_OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured on server' })

  const { titles } = req.body || {}
  if (!titles || !Array.isArray(titles) || titles.length === 0) {
    return res.status(400).json({ error: 'Missing or empty titles array' })
  }

  // Deduplicate and cap at 50 titles per call
  const unique: string[] = [...new Set(titles as string[])].slice(0, 50)

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
        max_tokens: 500 * unique.length,
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
      parsed = JSON.parse(content)
    } catch {
      return res.status(502).json({ error: 'Invalid JSON from OpenAI' })
    }

    return res.status(200).json({ descriptions: parsed.descriptions ?? {} })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
