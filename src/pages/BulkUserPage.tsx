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
import Papa from 'papaparse'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowLeft, Download, Upload, Users, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, FileText, UserPlus, UserCheck,
  ChevronRight, Eye, EyeOff, Mail, Send, Shield,
} from 'lucide-react'
import { getAuthHeaders } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// Row count above which each preview/processing/results table switches from a
// plain <tbody> map to a windowed render via @tanstack/react-virtual. Below
// this threshold rendering is byte-for-byte identical to before — this only
// engages for large CSV imports (e.g. 1,000+ rows) to keep the browser tab
// responsive. Same library/pattern already used in ProjectTable.tsx.
const VIRTUALIZE_THRESHOLD = 50
const BULK_ROW_HEIGHT = 40

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = 'create' | 'update' | 'error'
type ProcessResult = 'success' | 'failed' | 'pending' | 'processing'

interface CsvRow {
  email: string
  full_name: string
  status: string
  userId?: string             // populated by /api/users response on CREATE
  generatedPassword?: string  // server-generated, returned ONCE in /api/users response (audit H-3 fix 1)
  passwordRevealed?: boolean  // UI state: show/hide in results
  action?: RowStatus
  errorMsg?: string
  processResult?: ProcessResult
  processMsg?: string
  welcomeEmailSent?: boolean
  welcomeEmailError?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// (Removed: generateSecurePassword. Audit H-3 fix 1 — temp passwords are now
// generated server-side at the moment of Cognito user creation and returned
// in the create response. They no longer exist in the browser before the
// network call, eliminating the pre-call exposure window.)

function parseCSV(text: string): CsvRow[] {
  // Use papaparse for RFC-4180-correct parsing — handles quoted fields with
  // embedded commas (e.g. `"Doe, John"`), escaped quotes, CRLF line endings,
  // and BOMs. Replaces a hand-rolled split-on-comma that mis-parsed valid CSVs.
  // See audit L-3.
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  if (result.errors.length > 0) {
    // Papaparse "errors" can be benign warnings; surface only the first
    // structural one to the caller.
    const fatal = result.errors.find(e => e.type === 'Delimiter' || e.type === 'Quotes')
    if (fatal) throw new Error(`CSV parse error: ${fatal.message}`)
  }

  if (result.data.length === 0) return []
  if (!('email' in result.data[0])) {
    throw new Error('CSV must have an "email" column.')
  }

  return result.data
    .map(row => ({
      email:     (row.email     ?? '').trim(),
      full_name: (row.full_name ?? '').trim(),
      status:    (row.status    ?? 'active').trim() || 'active',
    }))
    .filter(r => r.email !== '')
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

  // ── Windowed rendering (large CSV imports) ──────────────────────────────
  // Derived, densely-indexed arrays for the two tables that filter `rows`
  // when rendering. Virtualizers need a real count + dense array, not a
  // sparse .map(() => null) result.
  const processingRows = rows.filter(r => r.action !== 'error')
  // Carries each row's ORIGINAL index into `rows` — toggleReveal() and the
  // welcome-email sender key off that original index, not a position in
  // this filtered subset, so it must be preserved through virtualization.
  const credentialRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.action === 'create' && row.processResult === 'success')

  const previewParentRef = useRef<HTMLDivElement>(null)
  const processingParentRef = useRef<HTMLDivElement>(null)
  const credentialsParentRef = useRef<HTMLDivElement>(null)
  const resultsParentRef = useRef<HTMLDivElement>(null)

  const previewVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => previewParentRef.current,
    estimateSize: () => BULK_ROW_HEIGHT,
    overscan: 20,
  })
  const processingVirtualizer = useVirtualizer({
    count: processingRows.length,
    getScrollElement: () => processingParentRef.current,
    estimateSize: () => BULK_ROW_HEIGHT,
    overscan: 20,
  })
  const credentialsVirtualizer = useVirtualizer({
    count: credentialRows.length,
    getScrollElement: () => credentialsParentRef.current,
    estimateSize: () => BULK_ROW_HEIGHT,
    overscan: 20,
  })
  const resultsVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => resultsParentRef.current,
    estimateSize: () => BULK_ROW_HEIGHT,
    overscan: 20,
  })

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
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`${API_BASE}/api/users`, { headers })
        if (res.ok) {
          const allUsers: Array<{ id: string; email: string }> = await res.json()
          existingEmails = new Set(allUsers.map(u => u.email))
          // Build email→id map for update operations
          ;(processFile as any)._emailToId = Object.fromEntries(allUsers.map(u => [u.email, u.id]))
        }
      } catch {
        // fail-open: treat all as new if lookup fails
      }
    }

    // Classify rows (CREATE vs UPDATE). Password generation now happens
    // server-side at the moment of Cognito user creation (audit H-3 fix 1) —
    // we no longer pre-generate it client-side.
    for (const row of parsed) {
      if (row.action === 'error') continue
      row.action = existingEmails.has(row.email) ? 'update' : 'create'
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
          // Server generates the password now (audit H-3 fix 1). The client
          // no longer sends `password` in the body — the Lambda creates the
          // user via Cognito AdminCreateUser with a server-generated temp
          // password and returns it ONCE in the response so the admin can
          // display it. The plaintext never lives in the client's bundle or
          // pre-call state.
          const createRes = await fetch(`${API_BASE}/api/users`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              email:     row.email,
              full_name: row.full_name || row.email,
              role:      'user',
            }),
          })
          if (!createRes.ok) {
            const errData = await createRes.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(errData.error || `Create failed (${createRes.status})`)
          }
          const createdUser = await createRes.json()
          // Stash for display/reveal UI — only lives in memory for this session.
          updated[i] = {
            ...updated[i],
            userId: createdUser.id,
            generatedPassword: createdUser.tempPassword,
          }

          if (!normalizeStatus(row.status)) {
            await fetch(`${API_BASE}/api/users/${createdUser.id}`, {
              method: 'PATCH',
              headers: await getAuthHeaders(),
              body: JSON.stringify({ is_active: false }),
            })
          }

          updated[i] = { ...updated[i], processResult: 'success', processMsg: 'Account created' }
        } else {
          const emailToId: Record<string, string> = (processFile as any)._emailToId ?? {}
          const targetId = emailToId[row.email]
          if (!targetId) throw new Error(`User ID not found for ${row.email} — re-upload the CSV to retry`)
          const updateRes = await fetch(`${API_BASE}/api/users/${targetId}`, {
            method: 'PATCH',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              full_name: row.full_name || null,
              is_active: normalizeStatus(row.status),
            }),
          })
          if (!updateRes.ok) {
            const errData = await updateRes.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(errData.error || `Update failed (${updateRes.status})`)
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
        // Hardened payload — server resolves recipient and temp password from the DB
        // via the welcome_pending table. Client no longer passes to/full_name/temp_password.
        // See audit H-2 / H-3 fix 1 and api/send-welcome.ts.
        if (!row.userId) {
          throw new Error(`No userId for ${row.email} — cannot send welcome email`)
        }
        const res = await fetch(`${API_BASE}/api/send-welcome`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ userId: row.userId }),
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

  // ── Row renderers (shared between plain and windowed table bodies) ──────
  // `rowProps` carries the virtualizer's `ref`/`data-index` when windowed;
  // omitted entirely for the plain (non-windowed, under-threshold) render.
  type RowProps = { ref?: (el: HTMLTableRowElement | null) => void; 'data-index'?: number }
  const renderPreviewRow = (row: CsvRow, i: number, rowProps: RowProps = {}) => (
    <tr key={i} className={row.action === 'error' ? 'bg-error/5' : ''} {...rowProps}>
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
  )

  const renderProcessingRow = (row: CsvRow, i: number, rowProps: RowProps = {}) => (
    <tr key={i} {...rowProps}>
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
  )

  // `idx` MUST be the row's original index into `rows` (see credentialRows
  // above) — toggleReveal(idx) and welcome-email tracking both key off it.
  const renderCredentialRow = (row: CsvRow, idx: number, rowProps: RowProps = {}) => {
    const revealed = showAllPasswords || row.passwordRevealed
    return (
      <tr key={idx} {...rowProps}>
        <td className="font-mono text-xs">{row.email}</td>
        <td className="text-sm">{row.full_name || '—'}</td>
        <td>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm font-bold text-primary transition-all ${revealed ? '' : 'blur-sm select-none'}`}>
              {row.generatedPassword}
            </span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => toggleReveal(idx)}
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
  }

  const renderResultRow = (row: CsvRow, i: number, rowProps: RowProps = {}) => (
    <tr key={i} className={
      row.processResult === 'failed' ? 'bg-error/5' :
      row.action === 'error' ? 'bg-base-200/50 opacity-50' : ''
    } {...rowProps}>
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
  )

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
              {rows.length <= VIRTUALIZE_THRESHOLD ? (
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
                      {rows.map((row, i) => renderPreviewRow(row, i))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div ref={previewParentRef} className="overflow-auto rounded-xl" style={{ height: 480 }}>
                  <table className="table table-sm">
                    <thead className="bg-base-200 text-xs uppercase tracking-wide sticky top-0 z-10">
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
                      {(() => {
                        const items = previewVirtualizer.getVirtualItems()
                        const totalSize = previewVirtualizer.getTotalSize()
                        const padTop = items.length > 0 ? items[0].start : 0
                        const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
                        return (
                          <>
                            {padTop > 0 && <tr aria-hidden="true"><td colSpan={7} style={{ height: padTop, padding: 0, border: 'none' }} /></tr>}
                            {items.map(virtualRow =>
                              renderPreviewRow(rows[virtualRow.index], virtualRow.index, {
                                ref: previewVirtualizer.measureElement,
                                'data-index': virtualRow.index,
                              })
                            )}
                            {padBottom > 0 && <tr aria-hidden="true"><td colSpan={7} style={{ height: padBottom, padding: 0, border: 'none' }} /></tr>}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
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
            {processingRows.length <= VIRTUALIZE_THRESHOLD ? (
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
                    {processingRows.map((row, i) => renderProcessingRow(row, i))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div ref={processingParentRef} className="overflow-auto" style={{ height: 480 }}>
                <table className="table table-xs">
                  <thead className="bg-base-200 sticky top-0 z-10">
                    <tr>
                      <th>Email</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const items = processingVirtualizer.getVirtualItems()
                      const totalSize = processingVirtualizer.getTotalSize()
                      const padTop = items.length > 0 ? items[0].start : 0
                      const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
                      return (
                        <>
                          {padTop > 0 && <tr aria-hidden="true"><td colSpan={4} style={{ height: padTop, padding: 0, border: 'none' }} /></tr>}
                          {items.map(virtualRow =>
                            renderProcessingRow(processingRows[virtualRow.index], virtualRow.index, {
                              ref: processingVirtualizer.measureElement,
                              'data-index': virtualRow.index,
                            })
                          )}
                          {padBottom > 0 && <tr aria-hidden="true"><td colSpan={4} style={{ height: padBottom, padding: 0, border: 'none' }} /></tr>}
                        </>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
            )}
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

                {credentialRows.length <= VIRTUALIZE_THRESHOLD ? (
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
                        {credentialRows.map(({ row, idx }) => renderCredentialRow(row, idx))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div ref={credentialsParentRef} className="overflow-auto rounded-lg border border-base-300" style={{ height: 480 }}>
                    <table className="table table-sm">
                      <thead className="bg-base-200 text-xs uppercase tracking-wide sticky top-0 z-10">
                        <tr>
                          <th>Email</th>
                          <th>Full Name</th>
                          <th>Temp Password</th>
                          <th>Welcome Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const items = credentialsVirtualizer.getVirtualItems()
                          const totalSize = credentialsVirtualizer.getTotalSize()
                          const padTop = items.length > 0 ? items[0].start : 0
                          const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
                          return (
                            <>
                              {padTop > 0 && <tr aria-hidden="true"><td colSpan={4} style={{ height: padTop, padding: 0, border: 'none' }} /></tr>}
                              {items.map(virtualRow => {
                                const { row, idx } = credentialRows[virtualRow.index]
                                return renderCredentialRow(row, idx, {
                                  ref: credentialsVirtualizer.measureElement,
                                  'data-index': virtualRow.index,
                                })
                              })}
                              {padBottom > 0 && <tr aria-hidden="true"><td colSpan={4} style={{ height: padBottom, padding: 0, border: 'none' }} /></tr>}
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}

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
              {rows.length <= VIRTUALIZE_THRESHOLD ? (
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
                      {rows.map((row, i) => renderResultRow(row, i))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div ref={resultsParentRef} className="overflow-auto rounded-xl" style={{ height: 480 }}>
                  <table className="table table-sm">
                    <thead className="bg-base-200 text-xs uppercase tracking-wide sticky top-0 z-10">
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
                      {(() => {
                        const items = resultsVirtualizer.getVirtualItems()
                        const totalSize = resultsVirtualizer.getTotalSize()
                        const padTop = items.length > 0 ? items[0].start : 0
                        const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
                        return (
                          <>
                            {padTop > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: padTop, padding: 0, border: 'none' }} /></tr>}
                            {items.map(virtualRow =>
                              renderResultRow(rows[virtualRow.index], virtualRow.index, {
                                ref: resultsVirtualizer.measureElement,
                                'data-index': virtualRow.index,
                              })
                            )}
                            {padBottom > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: padBottom, padding: 0, border: 'none' }} /></tr>}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
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
