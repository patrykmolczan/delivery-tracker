import React, { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getAuthHeaders } from '../lib/supabase'

const API = import.meta.env.VITE_API_BASE_URL ?? ''

// ── Status text → status_id ───────────────────────────────────────────────────
const STATUS_MAP: Record<string, number> = {
  'completed': 6, 'cancelled': 7, 'canceled': 7,
  'in process': 1, 'skv validation': 4, 'on hold': 5,
  'ready to deliver': 2, 'under review': 3,
}
function mapStatus(raw: unknown): number {
  if (!raw) return 3
  return STATUS_MAP[String(raw).toLowerCase().trim()] ?? 3
}

function excelDateToISO(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

// ── Projects Tab Parser ───────────────────────────────────────────────────────
// Header row index 1 (row 2 in Excel), data from index 2+
// Cols: 0=Project Owner, 1=Analyst, 2=Client Program, 3=Request Type,
//       4=ID#, 5=Requestor, 6=Date Received, 7=Expected Delivery,
//       8=Days to Complete (SKIP), 9=Day Until Due Date (SKIP),
//       10=Project Summary, 11=Country, 12=Job Count, 13=Industry,
//       14=Date Delivered, 15=Time Allocation, 16=Status, 17=Week# (SKIP)
interface ProjectRow {
  project_owner: string | null
  analyst: string | null
  client_name: string | null
  request_type: string | null
  external_id: string | null
  requestor: string | null
  date_received: string | null
  expected_delivery_date: string | null
  project_summary: string | null
  countries_text: string | null
  job_count: number | null
  industry: string | null
  date_delivered: string | null
  time_allocation: number | null
  status: string
}

function parseProjectsTab(ws: XLSX.WorkSheet): { rows: ProjectRow[]; skipped: number } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  // Row index 1 = headers, data starts at index 2
  const dataRows = raw.slice(2)
  const skipped = 0

  // Group rows by key: ID# if present, else client+date+summary
  const groups = new Map<string, { first: unknown[]; countries: string[]; jobCount: number }>()

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue
    const hasData = row.slice(0, 17).some(v => v != null && v !== '')
    if (!hasData) continue

    const idNum = row[4]
    const clientProg = String(row[2] ?? '').trim()
    const dateRec = excelDateToISO(row[6])
    const summary = String(row[10] ?? '').trim()

    const key = idNum != null && String(idNum).trim() !== ''
      ? `id::${String(idNum).trim()}`
      : `comp::${clientProg}|${dateRec}|${summary}`

    const country = row[11] != null ? String(row[11]).trim() : ''
    const jobCnt = row[12] != null ? Number(row[12]) : 0

    if (!groups.has(key)) {
      groups.set(key, { first: row as unknown[], countries: [], jobCount: 0 })
    }
    const g = groups.get(key)!
    if (country) g.countries.push(country)
    if (!isNaN(jobCnt)) g.jobCount += jobCnt
  }

  const rows: ProjectRow[] = []
  for (const { first, countries, jobCount } of groups.values()) {
    const idNum = first[4]
    rows.push({
      project_owner: first[0] != null ? String(first[0]).trim() || null : null,
      analyst: first[1] != null ? String(first[1]).trim() || null : null,
      client_name: first[2] != null ? String(first[2]).trim() || null : null,
      request_type: first[3] != null ? String(first[3]).trim() || null : null,
      external_id: idNum != null && String(idNum).trim() !== '' ? String(idNum).trim() : null,
      requestor: first[5] != null ? String(first[5]).trim() || null : null,
      date_received: excelDateToISO(first[6]),
      expected_delivery_date: excelDateToISO(first[7]),
      project_summary: first[10] != null ? String(first[10]).trim() || null : null,
      countries_text: countries.length > 0 ? countries.join(', ') : null,
      job_count: jobCount > 0 ? jobCount : null,
      industry: first[13] != null ? String(first[13]).trim() || null : null,
      date_delivered: excelDateToISO(first[14]),
      time_allocation: first[15] != null && !isNaN(Number(first[15])) ? Number(first[15]) : null,
      status: first[16] != null ? String(first[16]).trim() : '',
    })
  }

  return { rows, skipped }
}

// ── One-offs Tab Parser ───────────────────────────────────────────────────────
// Header row index 1 (row 2), data from index 2+
// Cols: 0=Date Received, 1=Analyst, 2=Client Program, 3=Request Type,
//       4=ID# (numeric-only; blank=import with null; non-numeric=skip),
//       5=Countries Requested, 6=Job Count, 7=Date Delivered,
//       8=Time Allocation, 9=Status, 10=Week# (SKIP), 11=Notes (SKIP)
interface OneOffRow {
  analyst: string | null
  client_name: string | null
  request_type: string | null
  external_id: string | null
  date_received: string | null
  countries_text: string | null
  job_count: number | null
  date_delivered: string | null
  time_allocation: number | null
  status: string
}

function parseOneOffsTab(ws: XLSX.WorkSheet): { rows: OneOffRow[]; skipped: number } {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  const dataRows = raw.slice(2)
  const rows: OneOffRow[] = []
  let skipped = 0

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue
    const hasData = row.slice(0, 10).some(v => v != null && v !== '')
    if (!hasData) continue

    // ID# validation: blank → null OK; non-blank must be integer
    const idRaw = row[4]
    let externalId: string | null = null
    if (idRaw != null && String(idRaw).trim() !== '') {
      const idStr = String(idRaw).trim()
      if (/^\d+$/.test(idStr)) {
        externalId = idStr
      } else {
        // Non-numeric, non-blank → skip this row
        skipped++
        continue
      }
    }

    rows.push({
      analyst: row[1] != null ? String(row[1]).trim() || null : null,
      client_name: row[2] != null ? String(row[2]).trim() || null : null,
      request_type: row[3] != null ? String(row[3]).trim() || null : null,
      external_id: externalId,
      date_received: excelDateToISO(row[0]),
      countries_text: row[5] != null ? String(row[5]).trim() || null : null,
      job_count: row[6] != null && !isNaN(Number(row[6])) ? Number(row[6]) : null,
      date_delivered: excelDateToISO(row[7]),
      time_allocation: row[8] != null && !isNaN(Number(row[8])) ? Number(row[8]) : null,
      status: row[9] != null ? String(row[9]).trim() : '',
    })
  }

  return { rows, skipped }
}

// ── Component ────────────────────────────────────────────────────────────────
interface Preview {
  projects: ProjectRow[]
  oneOffs: OneOffRow[]
  skippedOneOffs: number
  fileName: string
}

interface Props {
  onDone: () => void
}

export const ImportPage: React.FC<Props> = ({ onDone }) => {
  const { isAdmin } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [replace, setReplace] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ insertedProjects: number; insertedOneOffs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-base-content/50">Admin access required.</p>
      </div>
    )
  }

  const handleFile = async (file: File) => {
    setError(null)
    setPreview(null)
    setResult(null)
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      // Find the tabs by name (case-insensitive)
      const projectsSheetName = wb.SheetNames.find(n =>
        n.toLowerCase().includes('project') && !n.toLowerCase().includes('one')
      )
      const oneoffsSheetName = wb.SheetNames.find(n =>
        n.toLowerCase().includes('one') || n.toLowerCase().includes('off')
      )

      if (!projectsSheetName || !oneoffsSheetName) {
        const names = wb.SheetNames.join(', ')
        throw new Error(`Could not find "Projects" and "One-off Job Requests" tabs. Found: ${names}`)
      }

      const { rows: projects } = parseProjectsTab(wb.Sheets[projectsSheetName])
      const { rows: oneOffs, skipped: skippedOneOffs } = parseOneOffsTab(wb.Sheets[oneoffsSheetName])

      setPreview({ projects, oneOffs, skippedOneOffs, fileName: file.name })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse file')
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleConfirmImport = async () => {
    if (!preview) return
    setImporting(true)
    setError(null)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API}/api/import`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: preview.projects,
          oneOffs: preview.oneOffs,
          replace,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResult(data)
      setPreview(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Import from Excel</h2>
        <p className="text-sm text-base-content/60 mt-1">
          Upload the Delivery Tracker Excel file. Both <strong>Projects</strong> and <strong>One-off Job Requests</strong> tabs will be imported.
        </p>
      </div>

      {/* Result card */}
      {result && (
        <div className="card card-bordered bg-success/10 border-success/40">
          <div className="card-body gap-2 py-4">
            <div className="flex items-center gap-2 text-success font-semibold">
              <CheckCircle2 size={18} />
              Import complete!
            </div>
            <div className="text-sm space-y-1">
              <div>✅ <strong>{result.insertedProjects.toLocaleString()}</strong> projects imported</div>
              <div>✅ <strong>{result.insertedOneOffs.toLocaleString()}</strong> one-off jobs imported</div>
              <div className="font-semibold mt-1">Total: {(result.insertedProjects + result.insertedOneOffs).toLocaleString()} records</div>
            </div>
            <button className="btn btn-sm btn-ghost w-fit" onClick={onDone}>
              ← Back to projects
            </button>
          </div>
        </div>
      )}

      {/* Error card */}
      {error && (
        <div className="alert alert-error text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* File drop zone */}
      {!preview && !result && (
        <div
          className="border-2 border-dashed border-base-300 rounded-xl p-10 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />
          {parsing ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={32} className="text-primary animate-spin" />
              <p className="text-sm text-base-content/60">Parsing Excel file…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet size={40} className="text-base-content/30" />
              <p className="font-semibold">Drop Excel file here or click to browse</p>
              <p className="text-sm text-base-content/50">.xlsx or .xls — must contain "Projects" and "One-off Job Requests" tabs</p>
            </div>
          )}
        </div>
      )}

      {/* Preview card */}
      {preview && (
        <div className="card card-bordered bg-base-200">
          <div className="card-body gap-4">
            <div className="flex items-center gap-2 font-semibold">
              <Upload size={16} className="text-primary" />
              Ready to import — <span className="text-base-content/60 font-normal text-sm">{preview.fileName}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-base-100 rounded-lg p-4 space-y-1">
                <div className="text-2xl font-bold text-primary">{preview.projects.length.toLocaleString()}</div>
                <div className="text-sm font-medium">Unique Projects</div>
                <div className="text-xs text-base-content/50">Multi-country rows collapsed</div>
              </div>
              <div className="bg-base-100 rounded-lg p-4 space-y-1">
                <div className="text-2xl font-bold text-secondary">{preview.oneOffs.length.toLocaleString()}</div>
                <div className="text-sm font-medium">One-off Jobs</div>
                {preview.skippedOneOffs > 0 && (
                  <div className="text-xs text-warning">{preview.skippedOneOffs} skipped (invalid ID format)</div>
                )}
              </div>
            </div>

            {/* Sample previews */}
            {preview.projects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-base-content/50 uppercase mb-1">Sample projects</p>
                <div className="space-y-1">
                  {preview.projects.slice(0, 3).map((p, i) => (
                    <div key={i} className="text-xs bg-base-100 rounded px-3 py-1.5 flex justify-between gap-2">
                      <span className="truncate">{p.client_name || '—'} — {p.project_summary?.slice(0, 40) || '—'}</span>
                      <span className="text-base-content/40 flex-shrink-0">{p.date_received}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Replace option */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-warning checkbox-sm mt-0.5"
                checked={replace}
                onChange={e => setReplace(e.target.checked)}
              />
              <div>
                <div className="text-sm font-medium">Replace previously imported data</div>
                <div className="text-xs text-base-content/50">
                  Deletes all existing imported records before inserting. Projects created in the app are untouched.
                </div>
              </div>
            </label>

            {replace && (
              <div className="flex items-start gap-2 text-warning text-xs bg-warning/10 rounded-lg p-3">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                All previously imported projects and one-offs will be deleted and replaced.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                className="btn btn-primary gap-1.5"
                onClick={handleConfirmImport}
                disabled={importing}
              >
                {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? `Importing ${(preview.projects.length + preview.oneOffs.length).toLocaleString()} records…` : 'Confirm Import'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                disabled={importing}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
