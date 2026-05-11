/**
 * src/components/sso/AdminEntraSSO.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete Microsoft Entra ID SSO settings panel for the Admin page.
 *
 * The IT admin fills in this form — no Supabase dashboard or Vercel changes
 * needed. All credentials are saved to the database (client secret is
 * encrypted server-side with AES-256-GCM before storage).
 *
 * Fields:
 *   • Enable SSO toggle
 *   • Tenant ID          (Azure Directory / Tenant ID — GUID or domain)
 *   • Client ID          (Azure Application client ID — GUID)
 *   • Client Secret      (masked, never echoed back after first save)
 *   • Redirect URI       (auto-filled from window.origin, read-only with copy)
 *
 * Actions:
 *   • Save Settings      (POST /api/entra-save-settings — admin auth required)
 *   • Test Connection    (POST /api/entra-test — validates config + reaches MS)
 *
 * Inline collapsible setup guide walks the admin through Azure App Registration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useState } from 'react'
import {
  Key, Save, Loader2, AlertCircle, CheckCircle2, X,
  ExternalLink, Eye, EyeOff, Copy, Check, ChevronDown,
  ChevronUp, RefreshCw,
} from 'lucide-react'
import { getAuthHeaders } from '../../lib/supabase'
import { fetchAppSettings } from '../../lib/data'

// ── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  ssoEnabled:   boolean
  tenantId:     string
  clientId:     string
  clientSecret: string   // blank = keep existing encrypted secret
  tenantHint:   string
}

type TestStatus = 'idle' | 'loading' | 'success' | 'failed'
interface TestResult {
  status: TestStatus
  message: string
  details?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export const AdminEntraSSO: React.FC = () => {
  const redirectUri = `${window.location.origin}/auth/entra/callback`

  const [form, setForm] = useState<FormState>({
    ssoEnabled:   false,
    tenantId:     '',
    clientId:     '',
    clientSecret: '',
    tenantHint:   '',
  })
  const [hasExistingSecret, setHasExistingSecret] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle', message: '' })

  const field = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [key]: e.target.value }))
    setSuccess(''); setError('')
  }

  // ── Load current settings ─────────────────────────────────────────────────
  useEffect(() => {
    fetchAppSettings()
      .then(raw => {
        setForm({
          ssoEnabled:   raw['sso_enabled']    === 'true',
          tenantId:     raw['entra_tenant_id']  ?? '',
          clientId:     raw['entra_client_id']  ?? '',
          clientSecret: '',  // never echo back
          tenantHint:   raw['entra_tenant_hint'] ?? '',
        })
        setHasExistingSecret(!!raw['entra_client_secret_enc'])
      })
      .catch(() => setError('Could not load SSO settings.'))
      .finally(() => setLoaded(true))
  }, [])

  // ── Copy redirect URI ─────────────────────────────────────────────────────
  const handleCopy = async () => {
    await navigator.clipboard.writeText(redirectUri).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(''); setSuccess(''); setTestResult({ status: 'idle', message: '' })

    if (!form.tenantId.trim()) { setError('Tenant ID is required.'); return }
    if (!form.clientId.trim()) { setError('Client ID is required.'); return }
    if (!hasExistingSecret && !form.clientSecret.trim()) {
      setError('Client Secret is required.'); return
    }

    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/entra-save-settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ssoEnabled:   form.ssoEnabled,
          tenantId:     form.tenantId.trim(),
          clientId:     form.clientId.trim(),
          clientSecret: form.clientSecret.trim(),  // empty = keep existing
          redirectUri,
          tenantHint:   form.tenantHint.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      setSuccess('Settings saved successfully.')
      setHasExistingSecret(true)
      setForm(p => ({ ...p, clientSecret: '' }))  // clear after save
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Test connection ───────────────────────────────────────────────────────
  const handleTest = async () => {
    setTestResult({ status: 'loading', message: 'Testing connection to Microsoft…' })
    setError(''); setSuccess('')
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/entra-test', { method: 'POST', headers })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({
          status: 'success',
          message: `✓ Connected to tenant: ${data.tenantId}`,
          details: `Issuer: ${data.issuer}`,
        })
      } else {
        setTestResult({
          status: 'failed',
          message: data.error || 'Connection test failed',
          details: data.details,
        })
      }
    } catch (e: any) {
      setTestResult({ status: 'failed', message: e.message })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isConfigured = !!(form.tenantId && form.clientId && hasExistingSecret)

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-5">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-primary" />
            <h2 className="font-semibold text-base-content">SSO / Authentication</h2>
          </div>
          {/* Configuration status badge */}
          <span className={`badge badge-sm gap-1 ${isConfigured ? 'badge-success' : 'badge-warning'}`}>
            {isConfigured ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
            {isConfigured ? 'Configured' : 'Not configured'}
          </span>
        </div>

        <p className="text-xs text-base-content/50 -mt-3">
          Single Sign-On via <strong className="text-base-content/70">Microsoft Entra ID (Azure AD) OIDC</strong>.
          Fill in the fields below — no Supabase or Vercel changes required.
          Password login always remains available as a fallback.
        </p>

        {/* ── Alerts ────────────────────────────────────────────────────── */}
        {error && (
          <div className="alert alert-error py-2">
            <AlertCircle size={14} /><span className="text-sm flex-1">{error}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setError('')}><X size={11} /></button>
          </div>
        )}
        {success && (
          <div className="alert alert-success py-2">
            <CheckCircle2 size={14} /><span className="text-sm flex-1">{success}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setSuccess('')}><X size={11} /></button>
          </div>
        )}

        {/* ── Enable toggle ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between py-1 border-b border-base-300 pb-4">
          <div>
            <p className="text-sm font-medium text-base-content">Enable Microsoft Entra ID SSO</p>
            <p className="text-xs text-base-content/50">
              When on, the login page shows "Sign in with Microsoft" as the primary option
            </p>
          </div>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={form.ssoEnabled}
            disabled={!loaded || !isConfigured}
            title={!isConfigured ? 'Complete configuration before enabling' : undefined}
            onChange={e => { setForm(p => ({ ...p, ssoEnabled: e.target.checked })); setSuccess('') }}
          />
        </div>

        {/* ── Credentials ───────────────────────────────────────────────── */}
        <div className="grid gap-4">

          {/* Tenant ID */}
          <div className="form-control">
            <label className="label py-0.5">
              <span className="label-text text-sm font-medium">Directory (Tenant) ID <span className="text-error">*</span></span>
              <span className="label-text-alt text-xs text-base-content/40">
                Azure Portal → Entra ID → Overview
              </span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm font-mono"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.tenantId}
              disabled={!loaded}
              onChange={field('tenantId')}
            />
            <label className="label py-0.5">
              <span className="label-text-alt text-xs text-base-content/40">
                GUID (e.g. 9b3e4a2c-…) or domain (e.g. contoso.onmicrosoft.com).
                Use "common" for multi-tenant apps.
              </span>
            </label>
          </div>

          {/* Client ID */}
          <div className="form-control">
            <label className="label py-0.5">
              <span className="label-text text-sm font-medium">Application (Client) ID <span className="text-error">*</span></span>
              <span className="label-text-alt text-xs text-base-content/40">
                Azure Portal → App Registrations → your app → Overview
              </span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm font-mono"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.clientId}
              disabled={!loaded}
              onChange={field('clientId')}
            />
          </div>

          {/* Client Secret */}
          <div className="form-control">
            <label className="label py-0.5">
              <span className="label-text text-sm font-medium">
                Client Secret <span className="text-error">*</span>
                {hasExistingSecret && (
                  <span className="badge badge-xs badge-success ml-2 font-normal">saved</span>
                )}
              </span>
              <span className="label-text-alt text-xs text-base-content/40">
                Azure Portal → App Registrations → your app → Certificates &amp; secrets
              </span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                className="input input-bordered input-sm w-full pr-10 font-mono"
                placeholder={hasExistingSecret ? '(leave blank to keep existing secret)' : 'Paste client secret value here'}
                value={form.clientSecret}
                disabled={!loaded}
                onChange={field('clientSecret')}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs"
                onClick={() => setShowSecret(s => !s)}
                tabIndex={-1}
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <label className="label py-0.5">
              <span className="label-text-alt text-xs text-base-content/40">
                Stored encrypted (AES-256-GCM). Never echoed back. Paste the <em>Value</em>, not the Secret ID.
              </span>
            </label>
          </div>

          {/* Redirect URI — read-only with copy */}
          <div className="form-control">
            <label className="label py-0.5">
              <span className="label-text text-sm font-medium">Redirect URI</span>
              <span className="label-text-alt text-xs text-base-content/40">
                Add this exact URL to your Azure App Registration
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input input-bordered input-sm flex-1 font-mono text-xs bg-base-200"
                value={redirectUri}
                readOnly
              />
              <button
                type="button"
                className="btn btn-outline btn-sm gap-1"
                onClick={handleCopy}
              >
                {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <label className="label py-0.5">
              <span className="label-text-alt text-xs text-base-content/40">
                Azure Portal → App Registrations → your app → Authentication → Redirect URIs → Add URI
              </span>
            </label>
          </div>

        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="btn btn-primary btn-sm gap-1.5"
            disabled={loading || !loaded}
            onClick={handleSave}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Settings
          </button>

          <button
            className="btn btn-outline btn-sm gap-1.5"
            disabled={testResult.status === 'loading' || !isConfigured}
            title={!isConfigured ? 'Save settings first before testing' : undefined}
            onClick={handleTest}
          >
            {testResult.status === 'loading'
              ? <Loader2 size={13} className="animate-spin" />
              : testResult.status === 'success'
              ? <CheckCircle2 size={13} className="text-success" />
              : testResult.status === 'failed'
              ? <AlertCircle size={13} className="text-error" />
              : <RefreshCw size={13} />
            }
            Test Connection
          </button>
        </div>

        {/* ── Test result ───────────────────────────────────────────────── */}
        {testResult.status !== 'idle' && testResult.status !== 'loading' && (
          <div className={`alert py-2 text-sm ${testResult.status === 'success' ? 'alert-success' : 'alert-error'}`}>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{testResult.message}</span>
              {testResult.details && <span className="text-xs opacity-80">{testResult.details}</span>}
            </div>
          </div>
        )}

        {/* ── Setup guide ───────────────────────────────────────────────── */}
        <div className="border border-base-300 rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-base-content/70 hover:bg-base-200 transition-colors"
            onClick={() => setShowGuide(g => !g)}
          >
            <span className="flex items-center gap-2">
              <span>⚙️</span>
              Azure App Registration — Step-by-Step Setup Guide
            </span>
            {showGuide ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {showGuide && (
            <div className="px-4 pb-4 pt-1 text-xs text-base-content/60 space-y-3 border-t border-base-300">

              <div className="space-y-1">
                <p className="font-semibold text-base-content/80">Step 1 — Create an App Registration</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Go to <A href="https://portal.azure.com">portal.azure.com</A> and sign in as a Global Admin or Application Admin</li>
                  <li>Navigate to <strong>Microsoft Entra ID</strong> → <strong>App registrations</strong> → <strong>New registration</strong></li>
                  <li>Name: anything meaningful (e.g. "Delivery Tracker SSO")</li>
                  <li>Supported account types: <em>Accounts in this organizational directory only</em> (single-tenant)</li>
                  <li>Redirect URI: select <strong>Web</strong>, paste the Redirect URI from the field above</li>
                  <li>Click <strong>Register</strong></li>
                </ol>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-base-content/80">Step 2 — Copy Tenant ID and Client ID</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>On the app's <strong>Overview</strong> page, copy the <strong>Directory (tenant) ID</strong> → paste above</li>
                  <li>Copy the <strong>Application (client) ID</strong> → paste above</li>
                </ol>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-base-content/80">Step 3 — Create a Client Secret</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Go to <strong>Certificates &amp; secrets</strong> → <strong>Client secrets</strong> → <strong>New client secret</strong></li>
                  <li>Set a description and expiry (24 months recommended)</li>
                  <li>Click <strong>Add</strong> — copy the <strong>Value</strong> immediately (it's hidden after you leave the page)</li>
                  <li>Paste it into the Client Secret field above</li>
                </ol>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-base-content/80">Step 4 — Configure API Permissions</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Go to <strong>API permissions</strong> → <strong>Add a permission</strong> → <strong>Microsoft Graph</strong> → <strong>Delegated permissions</strong></li>
                  <li>Add: <code className="bg-base-300 px-1 rounded">openid</code>, <code className="bg-base-300 px-1 rounded">profile</code>, <code className="bg-base-300 px-1 rounded">email</code>, <code className="bg-base-300 px-1 rounded">offline_access</code></li>
                  <li>Click <strong>Grant admin consent</strong> (requires Global Admin)</li>
                </ol>
              </div>

              <div className="space-y-1">
                <p className="font-semibold text-base-content/80">Step 5 — Save &amp; Test</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li>Fill in all fields above and click <strong>Save Settings</strong></li>
                  <li>Click <strong>Test Connection</strong> to verify the tenant is reachable</li>
                  <li>Enable the toggle and save again</li>
                  <li>Open a private/incognito window and verify the "Sign in with Microsoft" button appears on the login page</li>
                </ol>
              </div>

              <p className="pt-1 border-t border-base-300 text-base-content/40">
                Need more help?{' '}
                <A href="https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app">
                  Microsoft Entra ID — Register an application
                </A>
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// Tiny helper to reduce repetition for external links
const A: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="underline underline-offset-2 inline-flex items-center gap-0.5"
  >
    {children}
    <ExternalLink size={10} />
  </a>
)

export default AdminEntraSSO
