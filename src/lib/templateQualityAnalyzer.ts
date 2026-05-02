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

export interface LocationIssue {
  rowIndex: number
  jobTitle: string
  issue: string
  severity: 'critical' | 'warning'
}

export interface MultiLocationRow {
  rowIndex: number
  jobTitle: string
  field: 'state' | 'city' | 'country'
  value: string
  detectedLocations: string[]
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
  locationIssues: LocationIssue[]
  multiLocationRows: MultiLocationRow[]
  rowsAnalyzed: number
}

// ─── Multi-location client-side detector ────────────────────────────────────
// Detects patterns like "Kentucky & Indiana", "New York / California",
// "Texas and Florida", "CA; NY" in state, city, or country fields.
// Runs instantly — no GPT needed for this structural check.

const MULTI_SEP_PATTERN = /\s*[&;]\s*|\s+and\s+/i
// For slash: only flag if both sides look like state/country names (3+ chars each)
const SLASH_MULTI_PATTERN = /^[a-zA-Z\s]{3,}\s*\/\s*[a-zA-Z\s]{3,}$/

function detectMultiLocation(value: string, _field: 'state' | 'city' | 'country'): string[] | null {
  if (!value || value.toLowerCase() === 'remote') return null

  let separator: string | null = null
  let parts: string[] = []

  if (MULTI_SEP_PATTERN.test(value)) {
    parts = value.split(MULTI_SEP_PATTERN).map(p => p.trim()).filter(Boolean)
    separator = parts.length > 1 ? '&/and/;' : null
  } else if (SLASH_MULTI_PATTERN.test(value)) {
    parts = value.split('/').map(p => p.trim()).filter(Boolean)
    separator = '/'
  }

  if (separator && parts.length > 1) return parts
  return null
}

function runMultiLocationCheck(rows: RawTemplateRow[]): MultiLocationRow[] {
  const issues: MultiLocationRow[] = []
  const seen = new Set<string>() // dedupe same value appearing many times

  for (const row of rows) {
    const checks: Array<{ field: 'state' | 'city' | 'country'; value: string }> = [
      { field: 'state', value: row.state },
      { field: 'city', value: row.city },
      { field: 'country', value: row.country },
    ]

    for (const { field, value } of checks) {
      if (!value) continue
      const dedupeKey = `${field}:${value.toLowerCase()}`
      // Report first occurrence per unique value, then summarise in UI
      if (seen.has(dedupeKey)) {
        // Still need to record the row for full reporting but skip adding a duplicate issue entry
        // We'll group by value in the UI, so just push with same value
      }
      const locations = detectMultiLocation(value, field)
      if (locations) {
        if (!seen.has(dedupeKey)) seen.add(dedupeKey)
        issues.push({
          rowIndex: row.rowIndex,
          jobTitle: row.jobTitle,
          field,
          value,
          detectedLocations: locations,
        })
      }
    }
  }

  return issues
}

// ─── Extract rows from template ──────────────────────────────────────────────

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

// ─── Main analysis function ──────────────────────────────────────────────────

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
        locationIssues: [],
        multiLocationRows: [],
        rowsAnalyzed: 0,
      }
    }

    // ── Client-side multi-location check (fast, deterministic, runs before GPT) ──
    const multiLocationRows = runMultiLocationCheck(rows)

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

    const systemPrompt = `You are a Senior Compensation Data Quality Analyst at a global HR consulting firm. You specialize in reviewing Pay Intelligence (pay equity/benchmarking) data templates before submission to the Pay Intel platform.

Your expertise:
- CRITICAL RULE: Pay Intel automatically delivers 5 pricing levels (Junior, Intermediate, Senior, Lead, Guru) for EVERY job title submitted. Therefore, users should NEVER include level modifiers in job titles. "Software Engineer" is perfect — Pay Intel will return all 5 levels. "Senior Software Engineer" is WRONG — the Sr. modifier is redundant and degrades data quality.
- Level modifiers to FLAG (should be removed from titles): Jr., Jr, Junior, Sr., Sr, Senior, Lead (as prefix/suffix modifier), I, II, III, IV, V (roman numerals as suffix), Associate (as prefix meaning entry-level), Staff (as prefix), Principal (as prefix meaning seniority), SME, Mid-Level, Entry-Level
- EXCEPTION — Do NOT flag these as leveling issues because the level IS the job title: Manager, Senior Manager, Director, Senior Director, VP, SVP, EVP, Head of, Chief, C-level titles, Team Lead (standalone job title). "Delivery Manager" is correct. "Engineering Manager" is correct. "VP of Finance" is correct.
- CRITICAL LOCATION RULE: Each row MUST contain only ONE location (one state AND one city). A row with "Kentucky & Indiana" in the State field is invalid — it must be split into two rows: one for Kentucky and one for Indiana. Flag any row where a state, city, or country field appears to contain multiple locations combined with &, and, /, comma, or semicolon separators. This is a structural error — the template cannot be processed correctly until each location is on its own row.
- LOCATION REQUIREMENTS: Country AND State/Province are both required for every row. City is optional but improves local accuracy. "Remote" is NOT a valid State/Province value — it is a work-arrangement term and will be flagged as invalid. Do NOT suggest leaving State/Province blank for any reason.
- Semantic duplicates are common and harmful: "DevOps Engineer" vs "Development Operations Engineer" vs "DevOps Engineer - Senior" are related and need review.
- Abbreviations that signal duplicates: Dev/Development, Ops/Operations, Eng/Engineer, Mgr/Manager, Admin/Administrator, Dir/Director, SW/Software, FE/Frontend, BE/Backend
- Missing job descriptions reduce pricing accuracy — always flag rows without descriptions
- Your output will be parsed as JSON — respond with ONLY valid JSON, no markdown fences, no explanation text outside the JSON.`

    const userPrompt = `Analyze this Pay Intel template data. Total rows in file: ${rows.length}. Unique combos being analyzed: ${compactRows.length}.
${multiLocationRows.length > 0 ? `\nNOTE: Client-side scan already detected ${multiLocationRows.length} multi-location rows (e.g., "${multiLocationRows[0]?.value}" in ${multiLocationRows[0]?.field} field). Do NOT re-flag these in locationIssues — they are handled separately. Focus your locationIssues on missing country/state or other location problems.\n` : ''}
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
- missingDataRows: ONLY include rows where country is blank/empty OR state/province is blank/empty OR description is blank/empty. Country and State/Province are both required fields.
- locationIssues: flag rows missing country; flag rows where state/province is blank (state/province is required — city is optional). Do NOT re-flag multi-location rows — those are handled separately. Do NOT suggest "remote" as a valid state/province value.
- Be concise in messages — max 120 chars per message field
- overallScore: start at 100, subtract: 15 per critical duplicate group, 10 per warning duplicate, 5 per missing description row (max -30 total for descriptions), 10 per missing country row (max -20), 8 per leveling issue (title contains unnecessary level modifier that Pay Intel handles automatically)
- issueCount: sum all items across all categories by their severity field`

    // Call via serverless proxy — avoids browser CORS + keeps API key server-side only
    const response = await fetch('/api/analyze-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt }),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(errData.error || `Server error ${response.status}`)
    }

    const data = await response.json()
    const raw = data.content
    if (!raw) throw new Error('Empty response from analysis server')

    const parsed = JSON.parse(raw) as Omit<TemplateQualityResult, 'rowsAnalyzed' | 'multiLocationRows'>

    // Adjust score downward for multi-location rows (client-side, deterministic)
    // -12 per unique bad value, capped at -35 total
    const uniqueMultiLocValues = new Set(multiLocationRows.map(r => `${r.field}:${r.value.toLowerCase()}`))
    const multiLocPenalty = Math.min(uniqueMultiLocValues.size * 12, 35)
    const adjustedScore = Math.max(0, (parsed.overallScore ?? 100) - multiLocPenalty)

    // Add multi-location critical count to issueCount
    const adjustedIssueCount = {
      ...parsed.issueCount,
      critical: (parsed.issueCount?.critical ?? 0) + (multiLocationRows.length > 0 ? uniqueMultiLocValues.size : 0),
    }

    return {
      ...parsed,
      overallScore: adjustedScore,
      issueCount: adjustedIssueCount,
      multiLocationRows,
      rowsAnalyzed: rows.length,
    }
  } catch (err) {
    return {
      overallScore: -1,
      summary: `Quality analysis unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`,
      issueCount: { critical: 0, warning: 0, info: 0 },
      duplicates: [],
      levelingIssues: [],
      missingDataRows: [],
      locationIssues: [],
      multiLocationRows: [],
      rowsAnalyzed: 0,
    }
  }
}
