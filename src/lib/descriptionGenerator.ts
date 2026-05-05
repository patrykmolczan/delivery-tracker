/**
 * descriptionGenerator.ts
 * Client-side helpers for the "Fill missing descriptions" feature.
 *
 * Flow:
 *   1. findRowsMissingDescriptions(file)   — scan Excel, return rows with empty description
 *   2. generateDescriptions(titles)         — call /api/generate-descriptions (GPT-4.1)
 *   3. buildExcelWithDescriptions(file, …)  — write descriptions into a new Excel Blob
 */
import * as XLSX from 'xlsx'
import { getAuthHeaders } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobRowInfo {
  /** 1-based Excel row number (row 1 = header, row 2 = first data row) */
  rowIndex: number
  jobTitle: string
}

// ─── Column detection helpers ─────────────────────────────────────────────────

function findColIdx(header: string[], patterns: string[]): number {
  return header.findIndex(h => patterns.some(p => h.includes(p)))
}

// ─── 1. Find rows with missing descriptions ───────────────────────────────────

/**
 * Read the original Excel template and return every row that:
 *   - Has a non-empty Job Title
 *   - Has at least one location field filled in (not an annotation row)
 *   - Has an empty Job Description cell
 */
export async function findRowsMissingDescriptions(file: File): Promise<JobRowInfo[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // Use the first sheet (same sheet the parser uses)
        const sheetName = wb.SheetNames.find(n =>
          n.toLowerCase().includes('rate request') || n.toLowerCase().includes('wand')
        ) ?? wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]

        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { resolve([]); return }

        const header = (rows[0] as string[]).map(h => String(h).trim().toLowerCase())

        const titleIdx   = findColIdx(header, ['job title'])
        const descIdx    = findColIdx(header, ['description'])
        const cityIdx    = findColIdx(header, ['city'])
        const stateIdx   = findColIdx(header, ['state'])
        const countryIdx = findColIdx(header, ['country'])

        // Without both title and description columns we cannot do anything
        if (titleIdx === -1 || descIdx === -1) { resolve([]); return }

        const result: JobRowInfo[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const title   = String(row[titleIdx]   ?? '').trim()
          const desc    = String(row[descIdx]    ?? '').trim()
          const city    = cityIdx    !== -1 ? String(row[cityIdx]    ?? '').trim() : ''
          const state   = stateIdx   !== -1 ? String(row[stateIdx]   ?? '').trim() : ''
          const country = countryIdx !== -1 ? String(row[countryIdx] ?? '').trim() : ''

          if (!title) continue  // empty row

          // Skip annotation-only rows (no location data at all — same rule as templateParser.ts)
          if (!city && !state && !country) continue

          if (!desc) {
            result.push({ rowIndex: i + 1, jobTitle: title })  // i+1: row 1 = header
          }
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message ?? 'unknown'}`))
    reader.readAsArrayBuffer(file)
  })
}

// ─── 2. Generate descriptions via API ────────────────────────────────────────

/**
 * Call /api/generate-descriptions with an array of unique job titles.
 * Returns a map of { jobTitle → generated description }.
 */
export async function generateDescriptions(titles: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(titles)]

  const headers = await getAuthHeaders()
  const resp = await fetch('/api/generate-descriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ titles: unique }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error((err as any).error ?? `API error ${resp.status}`)
  }

  const data = await resp.json()
  return (data.descriptions ?? {}) as Record<string, string>
}

// ─── 3. Build Excel with descriptions filled in ───────────────────────────────

/**
 * Read the original Excel file, fill in generated descriptions for rows
 * that currently have an empty description cell, and return a new Blob.
 *
 * Only rows whose description is empty are touched — all other content is
 * preserved exactly as the user submitted it.
 */
export async function buildExcelWithDescriptions(
  file: File,
  titleToDesc: Record<string, string>
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        // cellStyles: true preserves formatting in the output
        const wb = XLSX.read(data, { type: 'array', cellStyles: true })

        const sheetName = wb.SheetNames.find(n =>
          n.toLowerCase().includes('rate request') || n.toLowerCase().includes('wand')
        ) ?? wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]

        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) { resolve(new Blob()); return }

        const header = (rows[0] as string[]).map(h => String(h).trim().toLowerCase())
        const titleIdx = findColIdx(header, ['job title'])
        const descIdx  = findColIdx(header, ['description'])

        if (titleIdx === -1 || descIdx === -1) { resolve(new Blob()); return }

        const descColLetter = XLSX.utils.encode_col(descIdx)

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as unknown[]
          const title = String(row[titleIdx] ?? '').trim()
          const desc  = String(row[descIdx]  ?? '').trim()

          if (!title || desc) continue  // skip empty rows and rows that already have a description

          const generated = titleToDesc[title]
          if (!generated) continue

          const cellAddr = `${descColLetter}${i + 1}`  // +1: row 1 = header
          if (ws[cellAddr]) {
            ws[cellAddr].v = generated
            ws[cellAddr].t = 's'
            delete ws[cellAddr].f  // remove any formula
          } else {
            ws[cellAddr] = { t: 's', v: generated }
          }
        }

        const output = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
        resolve(
          new Blob([output], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
        )
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message ?? 'unknown'}`))
    reader.readAsArrayBuffer(file)
  })
}
