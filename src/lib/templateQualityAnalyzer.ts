import * as XLSX from 'xlsx'

export interface RawTemplateRow {
  rowIndex: number
  jobTitle: string
  country: string
  state: string
  city: string
  description: string
}

export interface DuplicateGroup {
  titles: string[]
  reason: string
  suggestion: string
  severity: 'critical' | 'warning'
}

export interface LevelingIssue {
  jobTitle: string
  issue: string
  suggestion: string
  severity: 'critical' | 'warning' | 'info'
}

export interface MissingDataIssue {
  rowIndex: number
  jobTitle: string
  missing: string[]
  severity: 'critical' | 'warning'
}

export interface LevelCoverageResult {
  jobFamily: string
  foundLevels: string[]
  missingLevels: string[]
  suggestion: string
}

export interface LocationIssue {
  rowIndex: number
  jobTitle: string
  issue: string
  severity: 'critical' | 'warning'
}

export interface TemplateQualityResult {
  overallScore: number
  summary: string
  issueCount: {
    critical: number
    warning: number
    info: number
  }
  duplicates: DuplicateGroup[]
  levelingIssues: LevelingIssue[]
  missingDataRows: MissingDataIssue[]
  levelCoverage: LevelCoverageResult[]
  locationIssues: LocationIssue[]
  rowsAnalyzed: number
}

export async function extractRawRows(file: File, _projectType: string): Promise<RawTemplateRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const ws = workbook.Sheets['Rate Request']
  if (!ws) return []

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as string[][]
  if (rows.length === 0) return []

  const headerRow = rows[0].map(h => (h || '').toString().toLowerCase())

  const findCol = (...keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = headerRow.findIndex(h => h.includes(kw))
      if (idx !== -1) return idx
    }
    return -1
  }

  const jobTitleCol = findCol('job title')
  const countryCol = findCol('country')
  const stateCol = findCol('state', 'province')
  const cityCol = findCol('city')
  const descriptionCol = findCol('description')

  const result: RawTemplateRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const jobTitle = jobTitleCol !== -1 ? (row[jobTitleCol] || '').toString().trim() : ''
    if (!jobTitle) continue

    result.push({
      rowIndex: i + 1,
      jobTitle,
      country: countryCol !== -1 ? (row[countryCol] || '').toString().trim() : '',
      state: stateCol !== -1 ? (row[stateCol] || '').toString().trim() : '',
      city: cityCol !== -1 ? (row[cityCol] || '').toString().trim() : '',
      description: descriptionCol !== -1 ? (row[descriptionCol] || '').toString().trim() : '',
    })

    if (result.length >= 200) break
  }

  return result
}

export async function analyzeTemplateQuality(file: File, projectType: string): Promise<TemplateQualityResult> {
  try {
    const rows = await extractRawRows(file, projectType)

    if (rows.length === 0) {
      return {
        overallScore: 0,
        summary: 'No data rows found in template.',
        issueCount: { critical: 1, warning: 0, info: 0 },
        duplicates: [],
        levelingIssues: [],
        missingDataRows: [],
        levelCoverage: [],
        locationIssues: [],
        rowsAnalyzed: 0,
      }
    }

    const seen = new Set<string>()
    const compactRows: Array<{ r: number; t: string; c: string; s: string; d: string }> = []

    for (const row of rows) {
      const key = `${row.jobTitle.toLowerCase()}|${row.country.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        compactRows.push({
          r: row.rowIndex,
          t: row.jobTitle,
          c: row.country || '',
          s: row.state || row.city || '',
          d: row.description ? row.description.substring(0, 120) : '',
        })
      }
      if (compactRows.length >= 120) break
    }

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) throw new Error('OpenAI API key not configured')

    const systemPrompt = `You are a Senior Compensation Data Quality Analyst at a global HR consulting firm. You specialize in reviewing Pay Intelligence (pay equity/benchmarking) data templates before submission to the Pay Intel platform.

Your expertise:
- Pay Intel platform requires 5 levels per job family: Junior (L1), Intermediate (L2), Senior (L3), Lead (L4), Guru (L5)
- Level indicators: Jr./Junior, Sr./Senior, Lead, Principal, Staff, I/II/III/IV/V, Manager, Director, VP, Head of, Chief, C-level, SME, Associate
- IMPORTANT: Some titles naturally contain hierarchy words but are standalone jobs. "Delivery Manager" is a real job title — not "Delivery" + level "Manager". Use judgment.
- Semantic duplicates are common and harmful: "DevOps Engineer" vs "Development Operations Engineer" vs "DevOps Engineer - Senior" are related and need review.
- Abbreviations that signal duplicates: Dev/Development, Ops/Operations, Eng/Engineer, Mgr/Manager, Admin/Administrator, Dir/Director, SW/Software, FE/Frontend, BE/Backend
- Missing job descriptions reduce pricing accuracy — always flag rows without descriptions
- Country is required for international benchmarking. State/city improves local accuracy. "Remote" is acceptable as city/state ONLY if country is present.
- Your output will be parsed as JSON — respond with ONLY valid JSON, no markdown fences, no explanation text outside the JSON.`

    const userPrompt = `Analyze this Pay Intel template data. Total rows in file: ${rows.length}. Unique combos being analyzed: ${compactRows.length}.

DATA (fields: r=rowNum, t=jobTitle, c=country, s=state/city, d=description preview):
${JSON.stringify(compactRows)}

Return a JSON object with EXACTLY this structure:
{
  "overallScore": <integer 0-100, where 100=perfect quality, 70+=acceptable, below 50=needs rework>,
  "summary": "<1-2 sentence executive summary of the overall template quality>",
  "issueCount": { "critical": <int>, "warning": <int>, "info": <int> },
  "duplicates": [
    {
      "titles": ["<title1>", "<title2>"],
      "reason": "<why these are duplicates>",
      "suggestion": "<recommended single canonical title>",
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
      "missing": ["description" | "country" | "state/city"],
      "severity": "critical" | "warning"
    }
  ],
  "levelCoverage": [
    {
      "jobFamily": "<base job family, e.g. Software Engineer>",
      "foundLevels": ["<level names found>"],
      "missingLevels": ["Junior" | "Intermediate" | "Senior" | "Lead" | "Guru"],
      "suggestion": "<recommended additions>"
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
- levelingIssues: flag inconsistent abbreviations (Sr. vs Senior mixed), flag job families where some rows have level indicators and others don't in an inconsistent way
- missingDataRows: ONLY include rows where country is blank/empty OR description is blank/empty (remote as state/city with a country is fine)
- levelCoverage: group job titles into families and show which of the 5 Pay Intel levels are present; only include families with 2+ rows in the data
- locationIssues: flag rows missing country entirely; flag rows where country is present but state AND city are both blank and the job isn't remote
- Be concise in messages — max 120 chars per message field
- overallScore: start at 100, subtract: 15 per critical duplicate group, 10 per warning duplicate, 5 per missing description row (max -30 total for descriptions), 10 per missing country row (max -20), 5 per leveling issue, 2 per missing level in coverage
- issueCount: sum all items across all categories by their severity field`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI API error: ${response.status} — ${err}`)
    }

    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw) throw new Error('Empty response from OpenAI')

    const parsed = JSON.parse(raw) as Omit<TemplateQualityResult, 'rowsAnalyzed'>
    return { ...parsed, rowsAnalyzed: rows.length }
  } catch (err) {
    return {
      overallScore: -1,
      summary: `Quality analysis unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`,
      issueCount: { critical: 0, warning: 0, info: 0 },
      duplicates: [],
      levelingIssues: [],
      missingDataRows: [],
      levelCoverage: [],
      locationIssues: [],
      rowsAnalyzed: 0,
    }
  }
}
