/**
 * BulkUserPage.tsx
 * -----------------
 * Admin-only page for bulk user creation and status management via CSV upload.
 *
 * SECURITY: Passwords are NEVER in the CSV. The system auto-generates a
 * cryptographically secure 12-character temporary password for each new user.
 * Passwords are displayed ONCE in the results page with blur/reveal, and
 * are never stored in the database (only the bcrypt hash is stored).
 *
 * Features:
 *  - Download a pre-filled CSV template (3 columns: email, full_name, status)
 *  - Upload filled CSV (new users → CREATE, existing users → UPDATE)
 *  - Preview table with action badges before committing
 *  - Process users one-by-one with live progress
 *  - Results: show generated credentials (blur/reveal) + Send Welcome Emails button
 *  - Welcome emails sent with 5-second delay between each send
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
  ArrowLeft, Download, Upload, Users, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, FileText, UserPlus, UserCheck,
  ChevronRight, Eye, EyeOff, Mail, Send, Shield,
} from 'lucide-react'
import { supabase, getAuthHeaders } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = 'create' | 'update' | 'error'
type ProcessResult = 'success' | 'failed' | 'pending' | 'processing'

interface CsvRow {
  email: string
  full_name: string
  status: string
  generatedPassword?: string  // auto-generated for CREATE rows
  passwordRevealed?: boolean  // UI state: show/hide in results
  action?: RowStatus
  errorMsg?: string
  processResult?: ProcessResult
  processMsg?: string
  welcomeEmailSent?: boolean
  welcomeEmailError?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 12-character password.
 *  Guarantees: 2 uppercase + 2 lowercase + 2 digits + 2 special + 4 random
 *  Uses crypto.getRandomValues — browser native, no dependencies */
function generateSecurePassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'   // removed I, O (confusing)
  const lower   = 'abcdefghjkmnpqrstuvwxyz'    // removed i, l, o (confusing)
  const digits  = '23456789'                   // removed 0, 1 (confusing)
  const special = '!@#$%^&*'

  const pick = (charset: string): string => {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    return charset[arr[0] % charset.length]
  }

  const required = [
    pick(upper), pick(upper),
    pick(lower), pick(lower),
    pick(digits), pick(digits),
    pick(special), pick(special),
  ]

  const all = upper + lower + digits + special
  const remaining = Array.from({ length: 4 }, () => pick(all))

  const combined = [...required, ...remaining]
  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const j = arr[0] % (i + 1)
    ;[combined[i], combined[j]] = [combined[j], combined[i]]
  }

  return combined.join('')
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const emailIdx    = header.indexOf('email')
  const fullNameIdx = header.indexOf('full_name')
  const statusIdx   = header.indexOf('status')

  if (emailIdx === -1) throw new Error('CSV must have an "email" column.')

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.match(/(\".*?\"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(',')
    const clean = (idx: number) => (cols[idx] ?? '').replace(/^"|"$/g, '').trim()

    rows.push({
      email:     clean(emailIdx),
      full_name: fullNameIdx !== -1 ? clean(fullNameIdx) : '',
      status:    statusIdx   !== -1 ? clean(statusIdx)   : 'active',
    })
  }
  return rows
}

function normalizeStatus(val: string): boolean {
  const v = (val ?? 'active').toLowerCase().trim()
  if (['inactive', 'false', '0', 'no', 'disabled', 'off'].includes(v)) return false
  return true
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  const [sendingWelcome, setSendingWelcome] = useState(false)
  const [welcomeSentCount, setWelcomeSentCount] = useState(0)
  const [showAllPasswords, setShowAllPasswords] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Stats ────────────────────────────────────────────────────────────────
  const toCreate   = rows.filter(r => r.action === 'create').length
  const toUpdate   = rows.filter(r => r.action === 'update').length
  const hasErrors  = rows.some(r => r.action === 'error')
  const succeeded  = rows.filter(r => r.processResult === 'success').length
  const failed     = rows.filter(r => r.processResult === 'failed').length
  const createdRows = rows.filter(r => r.action === 'create' && r.processResult === 'success')
  const welcomePending = createdRows.filter(r => !r.welcomeEmailSent).length

  // ── File handling ────────────────────────────────────────────────────────
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
      }
    }

    // Look up which emails already exist
    const validEmails = parsed.filter(r => r.action !== 'error').map(r => r.email)
    let existingEmails = new Set<string>()

    if (validEmails.length > 0) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('email')
        .in('email', validEmails)
      existingEmails = new Set((existing ?? []).map((e: { email: string }) => e.email))
    }

    // Classify rows and generate passwords for CREATE rows
    for (const row of parsed) {
      if (row.action === 'error') continue

      if (existingEmails.has(row.email)) {
        row.action = 'update'
      } else {
        row.action = 'create'
        // Auto-generate a secure temporary password — never from CSV
        row.generatedPassword = generateSecurePassword()
      }
    }

    // Mark remaining unclassified
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

  // ── Process users ────────────────────────────────────────────────────────
  const handleProcess = async () => {
    setStep('processing')
    setProcessedCount(0)

    setRows(prev => prev.map(r =>
      r.action === 'error' ? r : { ...r, processResult: 'pending', processMsg: '' }
    ))

    const updated = [...rows]
    let count = 0

    for (let i = 0; i < updated.length; i++) {
      const row = updated[i]
      if (row.action === 'error') continue

      updated[i] = { ...row, processResult: 'processing', processMsg: 'Processing…' }
      setRows([...updated])

      try {
        if (row.action === 'create') {
          if (!row.generatedPassword) {
            throw new Error('No generated password — please re-upload the CSV.')
          }
          const { error } = await supabase.rpc('admin_create_user', {
            p_email:     row.email,
            p_password:  row.generatedPassword,
            p_full_name: row.full_name || row.email,
            p_role:      'user',
          })
          if (error) {
            const msg = (error as any).message || JSON.stringify(error)
            throw new Error(msg)
          }

          if (!normalizeStatus(row.status)) {
            await supabase.rpc('admin_update_user', {
              p_email:     row.email,
              p_full_name: row.full_name || row.email,
              p_is_active: false,
            })
          }

          updated[i] = { ...updated[i], processResult: 'success', processMsg: 'Account created' }
        } else {
          const { error } = await supabase.rpc('admin_update_user', {
            p_email:     row.email,
            p_full_name: row.full_name || null,
            p_is_active: normalizeStatus(row.status),
          })
          if (error) {
            const msg = (error as any).message || JSON.stringify(error)
            throw new Error(msg)
          }
          updated[i] = { ...updated[i], processResult: 'success', processMsg: 'User updated' }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e)
        updated[i] = { ...updated[i], processResult: 'failed', processMsg: msg }
      }

      count++
      setProcessedCount(count)
      setRows([...updated])
    }

    setStep('results')
  }

  // ── Send Welcome Emails ──────────────────────────────────────────────────
  const handleSendWelcomeEmails = async () => {
    setSendingWelcome(true)
    setWelcomeSentCount(0)

    const eligibleRows = rows
      .map((r, i) => ({ row: r, idx: i }))
      .filter(({ row }) => row.action === 'create' && row.processResult === 'success' && !row.welcomeEmailSent)

    const updated = [...rows]
    let sentCount = 0

    for (let j = 0; j < eligibleRows.length; j++) {
      const { row, idx } = eligibleRows[j]

      try {
        const res = await fetch(`${API_BASE}/api/send-welcome`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            to: row.email,
            full_name: row.full_name || row.email,
            temp_password: row.generatedPassword,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        updated[idx] = { ...updated[idx], welcomeEmailSent: true }
        sentCount++
        setWelcomeSentCount(sentCount)
        setRows([...updated])
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        updated[idx] = { ...updated[idx], welcomeEmailError: msg }
        setRows([...updated])
      }

      // 5-second delay between emails (rate limit protection)
      if (j < eligibleRows.length - 1) {
        await sleep(5000)
      }
    }

    setSendingWelcome(false)
  }

  // ── Toggle password reveal per row ───────────────────────────────────────
  const toggleReveal = (idx: number) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, passwordRevealed: !r.passwordRevealed } : r
    ))
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRows([])
    setFileName('')
    setParseError('')
    setProcessedCount(0)
    setWelcomeSentCount(0)
    setSendingWelcome(false)
    setShowAllPasswords(false)
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

      {/* ── Security notice banner ── */}
      <div className="alert bg-success/10 border border-success/30 text-sm gap-2 py-2.5">
        <Shield className="w-4 h-4 text-success shrink-0" />
        <span className="text-success">
          <strong>Secure:</strong> Passwords are auto-generated by the system. No passwords in CSV files.
          Users must change their temporary password on first login.
        </span>
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

          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="card-title text-base">Step 1 — Download the Template</h2>
              </div>
              <p className="text-sm text-base-content/70">
                Fill out the CSV template and upload it below. Passwords are <strong>never</strong> in
                the CSV — the system generates secure temporary passwords automatically.
                Users must change them on first login.
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
                    <tr>
                      <td className="font-mono">email</td>
                      <td><span className="badge badge-error badge-xs">required</span></td>
                      <td>User's email address (must be unique)</td>
                    </tr>
                    <tr>
                      <td className="font-mono">full_name</td>
                      <td><span className="badge badge-ghost badge-xs">optional</span></td>
                      <td>Display name shown in the app</td>
                    </tr>
                    <tr>
                      <td className="font-mono">status</td>
                      <td><span className="badge badge-ghost badge-xs">optional</span></td>
                      <td><code>active</code> or <code>inactive</code> — defaults to active</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 p-3 bg-info/10 border border-info/20 rounded-lg">
                <Shield className="w-4 h-4 text-info shrink-0" />
                <p className="text-xs text-info">
                  <strong>No password column.</strong> Each new user receives a system-generated 12-character
                  temporary password (uppercase + lowercase + numbers + symbols). It is shown once
                  in the results page and emailed via the Send Welcome Emails feature.
                </p>
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

          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h2 className="card-title text-base">Step 2 — Upload Your CSV</h2>
              </div>

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
              <div className="stat-desc">will be skipped</div>
            </div>
          </div>

          {hasErrors && (
            <div className="alert alert-warning text-sm gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Some rows have errors and will be <strong>skipped</strong>. Fix them in your CSV and re-upload, or proceed with only the valid rows.</span>
            </div>
          )}

          {toCreate > 0 && (
            <div className="alert bg-info/10 border border-info/20 text-sm gap-2 py-2.5">
              <Shield className="w-4 h-4 text-info shrink-0" />
              <span className="text-info">
                <strong>{toCreate} new user{toCreate !== 1 ? 's' : ''}</strong> will receive auto-generated temporary passwords.
                Credentials will be shown once in the results page.
              </span>
            </div>
          )}

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
                        <td>
                          {row.action === 'create'
                            ? <span className="badge badge-success badge-xs gap-1"><Shield className="w-2.5 h-2.5" />Auto-generated</span>
                            : <span className="text-base-content/30 text-xs italic">Not changed</span>
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
                      <td><span className={badgeClass(row.action!)}>{row.action}</span></td>
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

          {/* Summary alert */}
          <div className={`alert ${failed === 0 ? 'alert-success' : 'alert-warning'} gap-3`}>
            {failed === 0
              ? <CheckCircle className="w-5 h-5 shrink-0" />
              : <AlertTriangle className="w-5 h-5 shrink-0" />
            }
            <div>
              <p className="font-semibold">
                {failed === 0
                  ? `All ${succeeded} user${succeeded !== 1 ? 's' : ''} processed successfully.`
                  : `${succeeded} succeeded, ${failed} failed — review errors below.`
                }
              </p>
              {rows.filter(r => r.action === 'error').length > 0 && (
                <p className="text-xs opacity-70">
                  {rows.filter(r => r.action === 'error').length} rows skipped due to validation errors.
                </p>
              )}
            </div>
          </div>

          {/* ── Generated Credentials Section ── */}
          {createdRows.length > 0 && (
            <div className="card bg-base-100 border border-warning/40 shadow-sm">
              <div className="card-body gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-warning" />
                    <h2 className="card-title text-base text-warning">Generated Credentials</h2>
                    <span className="badge badge-warning badge-sm">Shown Once</span>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs gap-1.5"
                    onClick={() => setShowAllPasswords(v => !v)}
                  >
                    {showAllPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showAllPasswords ? 'Hide All' : 'Show All'}
                  </button>
                </div>
                <div className="alert bg-warning/10 border-warning/20 text-xs gap-2 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                  <span>These passwords will not be shown again after you leave this page. Send welcome emails or copy them now.</span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-base-300">
                  <table className="table table-sm">
                    <thead className="bg-base-200 text-xs uppercase tracking-wide">
                      <tr>
                        <th>Email</th>
                        <th>Full Name</th>
                        <th>Temp Password</th>
                        <th>Welcome Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        if (row.action !== 'create' || row.processResult !== 'success') return null
                        const revealed = showAllPasswords || row.passwordRevealed
                        return (
                          <tr key={i}>
                            <td className="font-mono text-xs">{row.email}</td>
                            <td className="text-sm">{row.full_name || '—'}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-sm font-bold text-primary transition-all ${revealed ? '' : 'blur-sm select-none'}`}>
                                  {row.generatedPassword}
                                </span>
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => toggleReveal(i)}
                                  title={revealed ? 'Hide password' : 'Reveal password'}
                                >
                                  {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td>
                              {row.welcomeEmailSent
                                ? <span className="badge badge-success badge-xs gap-1"><CheckCircle className="w-3 h-3" /> Sent</span>
                                : row.welcomeEmailError
                                  ? <span className="badge badge-error badge-xs" title={row.welcomeEmailError}>Failed</span>
                                  : <span className="badge badge-ghost badge-xs">Pending</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Send Welcome Emails button */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="btn btn-primary btn-sm gap-2"
                    onClick={handleSendWelcomeEmails}
                    disabled={sendingWelcome || welcomePending === 0}
                  >
                    {sendingWelcome ? (
                      <>
                        <span className="loading loading-spinner loading-xs" />
                        Sending {welcomeSentCount}/{createdRows.length}… (5s between sends)
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Welcome Emails ({welcomePending} pending)
                      </>
                    )}
                  </button>
                  {welcomeSentCount > 0 && !sendingWelcome && (
                    <span className="text-xs text-success flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {welcomeSentCount} email{welcomeSentCount !== 1 ? 's' : ''} sent
                    </span>
                  )}
                  <span className="text-xs text-base-content/40 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    5 seconds between sends
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Full results table */}
          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body p-0">
              <div className="overflow-x-auto rounded-xl">
                <table className="table table-sm">
                  <thead className="bg-base-200 text-xs uppercase tracking-wide">
                    <tr>
                      <th>Email</th>
                      <th>Full Name</th>
                      <th>Action</th>
                      <th>Result</th>
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
                        <td><span className={badgeClass(row.action!)}>{row.action}</span></td>
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
                        <td className="text-xs text-base-content/60">{row.processMsg || row.errorMsg}</td>
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
