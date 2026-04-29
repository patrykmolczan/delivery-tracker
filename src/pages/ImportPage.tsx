import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Upload, Clipboard, CheckCircle2, AlertCircle, FileText, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchLookups, importProjectsBatch } from '../lib/data'
import type { LookupItem, ProjectFormData } from '../types'

type Step = 'upload' | 'map' | 'preview' | 'done'

interface ParsedRow {
  [key: string]: string
}

const EXPECTED_COLUMNS = [
  { key: 'project_owner', label: 'Project Owner', required: true },
  { key: 'client_name', label: 'Client Name', required: true },
  { key: 'date_received', label: 'Date Received', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'analyst', label: 'Analyst', required: false },
  { key: 'client_type', label: 'Client Type', required: false },
  { key: 'requestor', label: 'Requestor', required: false },
  { key: 'expected_delivery_date', label: 'Expected Delivery', required: false },
  { key: 'date_delivered', label: 'Date Delivered', required: false },
  { key: 'project_summary', label: 'Project Summary', required: false },
  { key: 'job_count', label: 'Job Count', required: false },
  { key: 'country', label: 'Country', required: false },
  { key: 'industry', label: 'Industry', required: false },
]

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(/,|\t/).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const values = line.split(/,|\t/).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: ParsedRow = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  }).filter(row => Object.values(row).some(v => v))
  return { headers, rows }
}

function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  EXPECTED_COLUMNS.forEach(col => {
    const match = headers.find(h => {
      const hn = h.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cn = col.key.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cl = col.label.toLowerCase().replace(/[^a-z0-9]/g, '')
      return hn === cn || hn === cl || hn.includes(cn) || cn.includes(hn)
    })
    if (match) mapping[col.key] = match
  })
  return mapping
}

function parseDate(val: string): string {
  if (!val) return ''
  // Try ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  // Try M/D/YYYY or MM/DD/YYYY
  const md = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (md) return `${md[3]}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
  // Try to parse
  const d = new Date(val)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

interface Props {
  onDone: () => void
}

export const ImportPage: React.FC<Props> = ({ onDone }) => {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('upload')
  const [_rawText, setRawText] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [lookups, setLookups] = useState<{ statuses: LookupItem[]; clientTypes: LookupItem[]; industries: LookupItem[]; countries: LookupItem[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchLookups().then(setLookups) }, [])

  const processText = (text: string) => {
    const { headers, rows } = parseCSV(text)
    if (!headers.length) return
    setRawText(text)
    setHeaders(headers)
    setRows(rows)
    setMapping(autoMap(headers))
    setStep('map')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => processText(e.target?.result as string)
    reader.readAsText(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const handlePaste = () => {
    if (pasteText.trim()) processText(pasteText)
  }

  const convertToFormData = (rows: ParsedRow[]): ProjectFormData[] => {
    if (!lookups) return []

    const findId = (list: LookupItem[], name: string): number | null => {
      const found = list.find(i => i.name.toLowerCase() === name.toLowerCase().trim())
      return found?.id ?? null
    }

    return rows.map(row => {
      const get = (key: string) => (mapping[key] ? row[mapping[key]] || '' : '')
      const statusName = get('status')
      const clientTypeName = get('client_type')
      const countryName = get('country')
      const industryName = get('industry')

      return {
        project_owner: get('project_owner'),
        analyst: get('analyst'),
        client_type_id: findId(lookups.clientTypes, clientTypeName),
        client_name: get('client_name'),
        requestor: get('requestor'),
        date_received: parseDate(get('date_received')),
        expected_delivery_date: parseDate(get('expected_delivery_date')),
        date_delivered: parseDate(get('date_delivered')),
        project_summary: get('project_summary'),
        job_count: get('job_count'),
        status_id: findId(lookups.statuses, statusName) ?? lookups.statuses.find(s => s.name === 'In Process')?.id ?? null,
        country_id: findId(lookups.countries, countryName),
        industry_id: findId(lookups.industries, industryName),
        project_type: null,
        project_countries: [],
        project_tasks: [],
      }
    }).filter(r => r.project_owner && r.client_name && r.date_received)
  }

  const validRows = convertToFormData(rows)

  const handleImport = async () => {
    if (!user || !validRows.length) return
    setImporting(true)
    try {
      const res = await importProjectsBatch(validRows, user.id)
      setResult(res)
      setStep('done')
    } catch (err: any) {
      setResult({ success: 0, errors: [err.message] })
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setRawText('')
    setPasteText('')
    setHeaders([])
    setRows([])
    setMapping({})
    setResult(null)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Import Projects</h1>
          <p className="text-sm text-base-content/50 mt-0.5">Upload a CSV or paste data to bulk-import projects</p>
        </div>
      </div>

      {/* Steps indicator */}
      <ul className="steps steps-horizontal w-full mb-8">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
          <li key={s} className={`step ${['upload', 'map', 'preview', 'done'].indexOf(step) >= i ? 'step-primary' : ''}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </li>
        ))}
      </ul>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Drag-drop zone */}
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
              ${dragOver ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50 hover:bg-base-200'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            <Upload size={36} className="mx-auto mb-3 text-primary/60" />
            <p className="font-semibold text-base-content">Drop your CSV file here</p>
            <p className="text-sm text-base-content/50 mt-1">or click to browse — CSV, TSV files supported</p>
          </div>

          <div className="divider text-base-content/30">or paste data</div>

          {/* Paste zone */}
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body">
              <div className="flex items-center gap-2 mb-2">
                <Clipboard size={16} className="text-primary" />
                <span className="font-semibold text-sm">Paste from Clipboard / Excel</span>
              </div>
              <textarea
                className="textarea textarea-bordered w-full h-36 font-mono text-xs"
                placeholder="Paste CSV or tab-separated data here (include header row)..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                <button
                  className="btn btn-primary btn-sm gap-2"
                  onClick={handlePaste}
                  disabled={!pasteText.trim()}
                >
                  <ChevronRight size={14} /> Parse Data
                </button>
              </div>
            </div>
          </div>

          {/* Template download */}
          <div className="text-center">
            <button
              className="btn btn-ghost btn-sm gap-2 text-base-content/50"
              onClick={() => {
                const csv = 'Project Owner,Client Name,Date Received,Status,Analyst,Client Type,Requestor,Expected Delivery,Date Delivered,Project Summary,Job Count,Country,Industry\nJane Smith,Acme Corp,2024-01-15,In Process,John Doe,Global,,2024-02-15,,Market study,50,United States,Healthcare\n'
                const blob = new Blob([csv], { type: 'text/csv' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = 'delivery-tracker-template.csv'
                a.click()
              }}
            >
              <FileText size={14} /> Download CSV Template
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'map' && (
        <div className="space-y-4">
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">Map Columns</h3>
                  <p className="text-sm text-base-content/50">Match your CSV columns to the tracker fields ({rows.length} rows found)</p>
                </div>
                <button className="btn btn-ghost btn-sm gap-1.5" onClick={reset}><X size={12} /> Start over</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXPECTED_COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-3">
                    <div className="w-36 flex-shrink-0">
                      <span className="text-sm font-medium">{col.label}</span>
                      {col.required && <span className="text-error text-xs ml-0.5">*</span>}
                    </div>
                    <select
                      className="select select-bordered select-sm flex-1"
                      value={mapping[col.key] || ''}
                      onChange={e => setMapping(m => ({ ...m, [col.key]: e.target.value }))}
                    >
                      <option value="">— Skip —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={reset}>Back</button>
            <button
              className="btn btn-primary gap-2"
              onClick={() => setStep('preview')}
              disabled={!mapping.project_owner || !mapping.client_name || !mapping.date_received}
            >
              Preview Import <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="stats stats-horizontal shadow bg-base-200 border border-base-300 w-full">
            <div className="stat">
              <div className="stat-title text-xs">Total Rows</div>
              <div className="stat-value text-lg">{rows.length}</div>
            </div>
            <div className="stat">
              <div className="stat-title text-xs">Valid to Import</div>
              <div className="stat-value text-lg text-success">{validRows.length}</div>
            </div>
            <div className="stat">
              <div className="stat-title text-xs">Skipped</div>
              <div className="stat-value text-lg text-warning">{rows.length - validRows.length}</div>
            </div>
          </div>

          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-0">
              <div className="overflow-x-auto">
                <table className="table table-sm table-zebra">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Owner</th>
                      <th>Client</th>
                      <th>Date</th>
                      <th>Status ID</th>
                      <th>Jobs</th>
                      <th>Valid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="text-base-content/40">{i + 1}</td>
                        <td>{r.project_owner || <span className="text-error">—</span>}</td>
                        <td>{r.client_name || <span className="text-error">—</span>}</td>
                        <td>{r.date_received || <span className="text-error">—</span>}</td>
                        <td>{r.status_id ?? <span className="text-warning">auto</span>}</td>
                        <td>{r.job_count || '—'}</td>
                        <td>
                          {r.project_owner && r.client_name && r.date_received
                            ? <CheckCircle2 size={14} className="text-success" />
                            : <AlertCircle size={14} className="text-error" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 20 && (
                  <p className="text-sm text-base-content/40 text-center py-2">
                    Showing first 20 of {validRows.length} valid rows
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button className="btn btn-ghost" onClick={() => setStep('map')}>Back</button>
            <button
              className={`btn btn-primary gap-2 ${importing ? 'loading' : ''}`}
              onClick={handleImport}
              disabled={!validRows.length || importing}
            >
              {!importing && <Upload size={16} />}
              {importing ? 'Importing…' : `Import ${validRows.length} Projects`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && result && (
        <div className="text-center space-y-6 py-8">
          {result.success > 0 ? (
            <CheckCircle2 size={56} className="mx-auto text-success" />
          ) : (
            <AlertCircle size={56} className="mx-auto text-error" />
          )}
          <div>
            <h2 className="text-2xl font-bold">
              {result.success > 0 ? 'Import Complete!' : 'Import Failed'}
            </h2>
            {result.success > 0 && (
              <p className="text-base-content/60 mt-1">{result.success} projects imported successfully</p>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="alert alert-warning text-left max-w-xl mx-auto">
              <AlertCircle size={18} />
              <div>
                <p className="font-semibold">Some batches had errors:</p>
                <ul className="text-sm mt-1 list-disc list-inside">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button className="btn btn-ghost gap-2" onClick={reset}><RefreshCw size={16} /> Import More</button>
            <button className="btn btn-primary" onClick={onDone}>Back to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  )
}
