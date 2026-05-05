import * as XLSX from 'xlsx'
import { getAuthHeaders } from './supabase'

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

    const country     = countryCol     !== -1 ? (row[countryCol]     || '').toString().trim() : ''
    const state       = stateCol       !== -1 ? (row[stateCol]       || '').toString().trim() : ''
    const city        = cityCol        !== -1 ? (row[cityCol]        || '').toString().trim() : ''
    const description = descriptionCol !== -1 ? (row[descriptionCol] || '').toString().trim() : ''

    // Skip annotation/metadata rows — rows where only the Job Title column has
    // data and all other key fields (Country, State, City, Description) are blank.
    // These are reference labels typed by the user (e.g. "Region", "Rocket City: AL")
    // and must not be reported as missing-data rows by the quality analyzer.
    if (!country && !state && !city && !description) continue

    result.push({ rowIndex: i + 1, jobTitle, country, state, city, description })

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
- missingDataRows: ONLY include rows where country is blank/empty OR state/province is blank/empty OR description is blank/empty. Country and State/Province are both required fields. Do NOT include rows where only the Job Title column has data and all other fields are blank — those are annotation rows, not data rows.
- locationIssues: flag rows missing country; flag rows where state/province is blank or contains a region/metro name instead of an actual state (e.g. "Bay Area" → flag and suggest "California"). Do NOT re-flag multi-location rows — those are handled separately. Do NOT suggest "remote" as a valid state/province value.
- Be concise in messages — max 120 chars per message field
- overallScore: start at 100, subtract: 15 per critical duplicate group, 10 per warning duplicate, 5 per missing description row (max -30 total for descriptions), 10 per missing country row (max -20), 8 per leveling issue (title contains unnecessary level modifier that Pay Intel handles automatically)
- issueCount: sum all items across all categories by their severity field`

    // Call via serverless proxy — avoids browser CORS + keeps API key server-side only
    // systemPrompt is now built server-side; client sends only the template data (userPrompt)
    const authHeaders = await getAuthHeaders()
    const response = await fetch('/api/analyze-template', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userPrompt }),
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
