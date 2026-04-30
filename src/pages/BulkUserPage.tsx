/**
 * BulkUserPage.tsx
 * -----------------
 * Admin-only page for bulk user creation and status management via CSV upload.
 *
 * Features:
 *  - Download a pre-filled CSV template
 *  - Upload a filled CSV (new users → CREATE, existing users → UPDATE)
 *  - Preview table with action badges before committing
 *  - Process users one-by-one with live progress
 *  - Results summary with per-row success/failure
 *
 * CSV columns: email, full_name, password (required for new only), status (active|inactive)
 *
 * DB functions used:
 *  - admin_create_user(p_email, p_password, p_full_name, p_role) — creates auth user + profile
 *  - admin_update_user(p_email, p_full_name, p_is_active)        — updates profile only
 *
 * ⚠️ DO NOT touch fetchProjects or data.ts from this file.
 * ⚠️ This page is only mounted for admin users — enforced by AdminPage.
 */

import React, { useState, useRef, useCallback } from 'react'
import {
  ArrowLeft,
  Download,
  Upload,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  UserPlus,
  UserCheck,
  ChevronRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = 'create' | 'update' | 'error'
type ProcessResult = 'success' | 'failed' | 'pending' | 'processing'

interface CsvRow {
  email: string
  full_name: string
  password: string
  status: string
  // Derived after lookup
  action?: RowStatus
  errorMsg?: string
  processResult?: ProcessResult
  processMsg?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const emailIdx    = header.indexOf('email')
  const fullNameIdx = header.indexOf('full_name')
  const passwordIdx = header.indexOf('password')
  const statusIdx   = header.indexOf('status')

  if (emailIdx === -1) throw new Error('CSV must have an "email" column.')

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Handle quoted fields
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(',')
    const clean = (idx: number) => (cols[idx] ?? '').replace(/^"|"$/g, '').trim()

    rows.push({
      email:     clean(emailIdx),
      full_name: fullNameIdx !== -1 ? clean(fullNameIdx) : '',
      password:  passwordIdx !== -1 ? clean(passwordIdx) : '',
      status:    statusIdx   !== -1 ? clean(statusIdx)   : 'active',
    })
  }
  return rows
}

function normalizeStatus(val: string): boolean {
  const v = (val ?? 'active').toLowerCase().trim()
  if (['inactive', 'false', '0', 'no', 'disabled', 'off'].includes(v)) return false
  return true // default active
}

function badgeClass(action: RowStatus): string {
  switch (action) {
    case 'create': return 'badge badge-success badge-sm gap-1'
    case 'update': return 'badge badge-info badge-sm gap-1'
    case 'error':  return 'badge badge-error badge-sm gap-1'
    default:       return 'badge badge-ghost badge-sm'
  }
}

function resultBadgeClass(r: ProcessResult): string {
  switch (r) {
    case 'success':    return 'badge badge-success badge-sm'
    case 'failed':     return 'badge badge-error badge-sm'
    case 'processing': return 'badge badge-warning badge-sm gap-1'
    default:           return 'badge badge-ghost badge-sm'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface BulkUserPageProps {
  onBack: () => void
}

type Step = 'upload' | 'preview' | 'processing' | 'results'

export default function BulkUserPage({ onBack }: BulkUserPageProps) {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<CsvRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Stats derived from rows ───────────────────────────────────────────────
  const toCreate  = rows.filter(r => r.action === 'create').length
  const toUpdate  = rows.filter(r => r.action === 'update').length
  const hasErrors = rows.some(r => r.action === 'error')
  const succeeded = rows.filter(r => r.processResult === 'success').length
  const failed    = rows.filter(r => r.processResult === 'failed').length

  // ── File handling ─────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setParseError('')
    setFileName(file.name)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.')
      return
    }

    const text = await file.text()
    let parsed: CsvRow[]
    try {
      parsed = parseCSV(text)
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse CSV.')
      return
    }

    if (parsed.length === 0) {
      setParseError('CSV has no data rows.')
      return
    }

    // Validate emails
    for (const row of parsed) {
      if (!row.email || !row.email.includes('@')) {
        row.action = 'error'
        row.errorMsg = 'Invalid or missing email'
        continue
      }
    }

    // Look up which emails already exist in profiles
    const validEmails = parsed.filter(r => r.action !== 'error').map(r => r.email)
    let existingEmails = new Set<string>()

    if (validEmails.length > 0) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('email')
        .in('email', validEmails)

      existingEmails = new Set((existing ?? []).map((e: { email: string }) => e.email))
    }

    // Classify each row
    for (const row of parsed) {
      if (row.action === 'error') continue

      if (existingEmails.has(row.email)) {
        row.action = 'update'
        row.errorMsg = undefined
      } else {
        row.action = 'create'
        // New users must have a password
        if (!row.password || row.password.length < 6) {
          row.action = 'error'
          row.errorMsg = 'New user requires a password (min 6 chars)'
        }
      }
    }

    // Mark remaining unclassified rows
    for (const row of parsed) {
      if (!row.action) row.action = 'error'
    }

    setRows(parsed)
    setStep('preview')
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  // ── Process all rows ──────────────────────────────────────────────────────
  const handleProcess = async () => {
    setStep('processing')
    setProcessedCount(0)

    // Mark all as pending
    setRows(prev => prev.map(r =>
      r.action === 'error'
        ? r
        : { ...r, processResult: 'pending', processMsg: '' }
    ))

    const updated = [...rows]
    let count = 0

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      if (row.action === 'error') continue

      // Mark as processing
      updated[i] = { ...row, processResult: 'processing', processMsg: 'Processing…' }
      setRows([...updated])

      try {
        if (row.action === 'create') {
          const { error } = await supabase.rpc('admin_create_user', {
            p_email:     row.email,
            p_password:  row.password,
            p_full_name: row.full_name || row.email,
            p_role:      'user',
          })
          if (error) throw error

          // Set is_active if inactive
          if (!normalizeStatus(row.status)) {
            await supabase.rpc('admin_update_user', {
              p_email:     row.email,
              p_full_name: row.full_name || row.email,
              p_is_active: false,
            })
          }

          updated[i] = { ...updated[i], processResult: 'success', processMsg: 'User created' }
        } else {
          // update
          const { error } = await supabase.rpc('admin_update_user', {
            p_email:     row.email,
            p_full_name: row.full_name || null,
            p_is_active: normalizeStatus(row.status),
          })
          if (error) throw error

          updated[i] = { ...updated[i], processResult: 'success', processMsg: 'User updated' }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        updated[i] = { ...updated[i], processResult: 'failed', processMsg: msg }
      }

      count++
      setProcessedCount(count)
      setRows([...updated])
    }

    setStep('results')
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRows([])
    setFileName('')
    setParseError('')
    setProcessedCount(0)
    setStep('upload')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Back to Admin
        </button>
        <div className="divider divider-horizontal m-0" />
        <Users className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold">Bulk User Management</h1>
      </div>

      {/* ── Step indicator ── */}
      <ul className="steps w-full text-xs">
        <li className={`step ${['upload','preview','processing','results'].includes(step) ? 'step-primary' : ''}`}>Upload CSV</li>
        <li className={`step ${['preview','processing','results'].includes(step) ? 'step-primary' : ''}`}>Preview</li>
        <li className={`step ${['processing','results'].includes(step) ? 'step-primary' : ''}`}>Process</li>
        <li className={`step ${step === 'results' ? 'step-primary' : ''}`}>Results</li>
      </ul>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1 — UPLOAD
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <div className="flex flex-col gap-4">

          {/* Template card */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="card-title text-base">Step 1 — Download the Template</h2>
              </div>
              <p className="text-sm text-base-content/70">
                Fill out the CSV template and upload it below. The system will automatically
                detect which users are <span className="font-semibold text-success">new</span> (CREATE)
                and which already exist (UPDATE status / name).
              </p>

              <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-xs">
                  <thead className="bg-base-200">
                    <tr>
                      <th>Column</th>
                      <th>Required</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td className="font-mono">email</td><td><span className="badge badge-error badge-xs">required</span></td><td>User's email address (must be unique)</td></tr>
                    <tr><td className="font-mono">full_name</td><td><span className="badge badge-ghost badge-xs">optional</span></td><td>Display name shown in the app</td></tr>
                    <tr><td className="font-mono">password</td><td><span className="badge badge-warning badge-xs">new users</span></td><td>Minimum 6 characters. Leave blank to skip for updates.</td></tr>
                    <tr><td className="font-mono">status</td><td><span className="badge badge-ghost badge-xs">optional</span></td><td><code>active</code> or <code>inactive</code> — defaults to active</td></tr>
                  </tbody>
                </table>
              </div>

              <a
                href="/bulk_users_template.csv"
                download="bulk_users_template.csv"
                className="btn btn-primary btn-sm w-fit gap-2"
              >
                <Download className="w-4 h-4" />
                Download Template CSV
              </a>
            </div>
          </div>

          {/* Upload card */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h2 className="card-title text-base">Step 2 — Upload Your CSV</h2>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-12 cursor-pointer transition-colors
                  ${isDragging ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50 hover:bg-base-200/40'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <Upload className={`w-10 h-10 ${isDragging ? 'text-primary' : 'text-base-content/30'}`} />
                <div className="text-center">
                  <p className="font-semibold text-sm">Drop your CSV here or click to browse</p>
                  <p className="text-xs text-base-content/50 mt-1">Accepts .csv files only</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>

              {parseError && (
                <div className="alert alert-error text-sm gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2 — PREVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'preview' && (
        <div className="flex flex-col gap-4">

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat bg-base-100 border border-base-300 rounded-xl p-4">
              <div className="stat-title text-xs">Total Rows</div>
              <div className="stat-value text-2xl">{rows.length}</div>
              <div className="stat-desc">{fileName}</div>
            </div>
            <div className="stat bg-base-100 border border-success/30 rounded-xl p-4">
              <div className="stat-title text-xs text-success">To Create</div>
              <div className="stat-value text-2xl text-success">{toCreate}</div>
              <div className="stat-desc">new accounts</div>
            </div>
            <div className="stat bg-base-100 border border-info/30 rounded-xl p-4">
              <div className="stat-title text-xs text-info">To Update</div>
              <div className="stat-value text-2xl text-info">{toUpdate}</div>
              <div className="stat-desc">existing users</div>
            </div>
            <div className="stat bg-base-100 border border-error/30 rounded-xl p-4">
              <div className="stat-title text-xs text-error">Errors</div>
              <div className="stat-value text-2xl text-error">{rows.filter(r => r.action === 'error').length}</div>
              <div className="stat-desc">must fix before processing</div>
            </div>
          </div>

          {hasErrors && (
            <div className="alert alert-warning text-sm gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Some rows have errors and will be <strong>skipped</strong> during processing. Fix them in your CSV and re-upload, or proceed to process only the valid rows.</span>
            </div>
          )}

          {/* Preview table */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body p-0">
              <div className="overflow-x-auto rounded-xl">
                <table className="table table-sm">
                  <thead className="bg-base-200 text-xs uppercase tracking-wide">
                    <tr>
                      <th>#</th>
                      <th>Action</th>
                      <th>Email</th>
                      <th>Full Name</th>
                      <th>Password</th>
                      <th>Status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.action === 'error' ? 'bg-error/5' : ''}>
                        <td className="text-base-content/40 text-xs">{i + 1}</td>
                        <td>
                          <span className={badgeClass(row.action!)}>
                            {row.action === 'create' && <UserPlus className="w-3 h-3" />}
                            {row.action === 'update' && <UserCheck className="w-3 h-3" />}
                            {row.action === 'error'  && <XCircle className="w-3 h-3" />}
                            {row.action}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{row.email}</td>
                        <td className="text-sm">{row.full_name || <span className="text-base-content/30 italic">—</span>}</td>
                        <td className="font-mono text-xs">
                          {row.action === 'create' && row.password
                            ? '•'.repeat(Math.min(row.password.length, 10))
                            : <span className="text-base-content/30 italic">—</span>
                          }
                        </td>
                        <td>
                          <span className={`badge badge-xs ${normalizeStatus(row.status) ? 'badge-success' : 'badge-ghost'}`}>
                            {normalizeStatus(row.status) ? 'active' : 'inactive'}
                          </span>
                        </td>
                        <td className="text-xs text-error">{row.errorMsg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button className="btn btn-ghost btn-sm gap-1.5" onClick={handleReset}>
              <RefreshCw className="w-4 h-4" />
              Upload Different File
            </button>
            <button
              className="btn btn-primary btn-sm gap-1.5"
              disabled={toCreate + toUpdate === 0}
              onClick={handleProcess}
            >
              Process {toCreate + toUpdate} User{toCreate + toUpdate !== 1 ? 's' : ''}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 3 — PROCESSING
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'processing' && (
        <div className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body gap-4">
            <div className="flex items-center gap-3">
              <span className="loading loading-spinner loading-md text-primary" />
              <div>
                <p className="font-semibold">Processing users…</p>
                <p className="text-xs text-base-content/50">{processedCount} of {toCreate + toUpdate} complete</p>
              </div>
            </div>
            <progress
              className="progress progress-primary w-full"
              value={processedCount}
              max={toCreate + toUpdate}
            />
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead className="bg-base-200">
                  <tr>
                    <th>Email</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.action !== 'error').map((row, i) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{row.email}</td>
                      <td>
                        <span className={badgeClass(row.action!)}>
                          {row.action}
                        </span>
                      </td>
                      <td>
                        {row.processResult ? (
                          <span className={resultBadgeClass(row.processResult)}>
                            {row.processResult === 'processing' && <span className="loading loading-spinner loading-xs" />}
                            {row.processResult}
                          </span>
                        ) : (
                          <span className="badge badge-ghost badge-xs">queued</span>
                        )}
                      </td>
                      <td className="text-xs text-base-content/60">{row.processMsg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 4 — RESULTS
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'results' && (
        <div className="flex flex-col gap-4">

          {/* Summary */}
          <div className={`alert ${failed === 0 ? 'alert-success' : 'alert-warning'} gap-3`}>
            {failed === 0
              ? <CheckCircle className="w-5 h-5 shrink-0" />
              : <AlertTriangle className="w-5 h-5 shrink-0" />
            }
            <div>
              <p className="font-semibold">
                {failed === 0
                  ? `All ${succeeded} user${succeeded !== 1 ? 's' : ''} processed successfully!`
                  : `${succeeded} succeeded, ${failed} failed — review errors below`
                }
              </p>
              <p className="text-xs opacity-70">
                {rows.filter(r => r.action === 'error').length > 0 &&
                  `${rows.filter(r => r.action === 'error').length} rows were skipped due to validation errors.`
                }
              </p>
            </div>
          </div>

          {/* Results table */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body p-0">
              <div className="overflow-x-auto rounded-xl">
                <table className="table table-sm">
                  <thead className="bg-base-200 text-xs uppercase tracking-wide">
                    <tr>
                      <th>Email</th>
                      <th>Full Name</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Active</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={
                        row.processResult === 'failed' ? 'bg-error/5' :
                        row.action === 'error' ? 'bg-base-200/50 opacity-50' : ''
                      }>
                        <td className="font-mono text-xs">{row.email}</td>
                        <td className="text-sm">{row.full_name || '—'}</td>
                        <td>
                          <span className={badgeClass(row.action!)}>
                            {row.action}
                          </span>
                        </td>
                        <td>
                          {row.processResult ? (
                            <span className={resultBadgeClass(row.processResult)}>
                              {row.processResult}
                            </span>
                          ) : (
                            <span className="badge badge-ghost badge-xs">skipped</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-xs ${normalizeStatus(row.status) ? 'badge-success' : 'badge-ghost'}`}>
                            {normalizeStatus(row.status) ? 'active' : 'inactive'}
                          </span>
                        </td>
                        <td className="text-xs text-base-content/60">
                          {row.processMsg || row.errorMsg}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button className="btn btn-ghost btn-sm gap-1.5" onClick={handleReset}>
              <Upload className="w-4 h-4" />
              Process Another File
            </button>
            <button className="btn btn-primary btn-sm gap-1.5" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
              Back to Admin
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
