/**
 * api/lib/entraSettings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helpers for reading and writing Microsoft Entra ID OIDC credentials stored
 * in the app_settings table.
 *
 * The client secret is sensitive — it is stored encrypted with AES-256-GCM.
 * The encryption key is derived from the already-existing SUPABASE_SERVICE_ROLE_KEY
 * via HKDF-SHA256. No new environment variables are required.
 *
 * Encryption format stored in app_settings (key = entra_client_secret_enc):
 *   "<iv_base64>:<ciphertext_base64>:<authTag_base64>"
 *   e.g. "abc123==:xyz789==:def456=="
 *
 * Security properties:
 *   • AES-256-GCM provides authenticated encryption (tamper detection)
 *   • 12-byte random IV ensures ciphertext uniqueness per save
 *   • Key derivation isolates the encryption key from the Supabase key
 *   • The plaintext secret is never written to DB or logged
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ── Env helpers ───────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ── Key derivation ────────────────────────────────────────────────────────────

const ENCRYPTION_CONTEXT = 'entra-client-secret-v1'

/**
 * Derive a 32-byte AES-256 key from the Supabase service role key using
 * a two-step HKDF-like construction with HMAC-SHA256.
 *
 * HKDF-Extract: PRK = HMAC-SHA256(salt="entra-kdf-salt", IKM=service_role_key)
 * HKDF-Expand:  OKM = HMAC-SHA256(PRK, info=ENCRYPTION_CONTEXT + 0x01)
 */
function deriveEncryptionKey(): Buffer {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  // Extract
  const prk = createHmac('sha256', 'entra-kdf-salt')
    .update(serviceRoleKey)
    .digest()

  // Expand (HKDF single-block; 32 bytes = one SHA-256 output)
  const okm = createHmac('sha256', prk)
    .update(ENCRYPTION_CONTEXT + '\x01')
    .digest()

  return okm // 32 bytes → AES-256
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "<iv_base64>:<ciphertext_base64>:<authTag_base64>".
 */
export function encryptSecret(plaintext: string): string {
  const key = deriveEncryptionKey()
  const iv  = randomBytes(12) // 96-bit IV for GCM

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString('base64'), ciphertext.toString('base64'), authTag.toString('base64')].join(':')
}

/**
 * Decrypt a value produced by encryptSecret().
 * Throws on tampering (GCM auth tag mismatch) or malformed input.
 */
export function decryptSecret(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format')

  const [ivB64, ciphertextB64, authTagB64] = parts
  const key        = deriveEncryptionKey()
  const iv         = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const authTag    = Buffer.from(authTagB64, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntraCredentials {
  tenantId:     string
  clientId:     string
  clientSecret: string  // decrypted plaintext
  redirectUri:  string
}

export interface EntraSettingsRaw {
  ssoEnabled:         boolean
  tenantId:           string
  clientId:           string
  clientSecretEnc:    string  // encrypted, as stored in DB
  redirectUri:        string
  tenantDisplayHint:  string  // cosmetic label for the admin UI
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

const SETTING_KEYS = [
  'sso_enabled',
  'sso_provider',
  'entra_tenant_id',
  'entra_client_id',
  'entra_client_secret_enc',
  'entra_redirect_uri',
  'entra_tenant_hint',
] as const

/**
 * Read all Entra ID settings from app_settings and return them typed.
 * Throws if required credentials are missing.
 */
export async function readEntraSettings(): Promise<EntraSettingsRaw> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', SETTING_KEYS as unknown as string[])

  if (error) throw new Error(`Failed to read Entra settings: ${error.message}`)

  const s: Record<string, string> = {}
  for (const row of data ?? []) {
    if (row.value != null) s[row.key] = row.value
  }

  return {
    ssoEnabled:        s['sso_enabled'] === 'true',
    tenantId:          s['entra_tenant_id']          ?? '',
    clientId:          s['entra_client_id']          ?? '',
    clientSecretEnc:   s['entra_client_secret_enc']  ?? '',
    redirectUri:       s['entra_redirect_uri']       ?? '',
    tenantDisplayHint: s['entra_tenant_hint']        ?? '',
  }
}

/**
 * Read Entra settings and decrypt the client secret.
 * Returns fully usable credentials for the OIDC flow.
 * Throws with actionable error messages if any required field is missing.
 */
export async function readEntraCredentials(): Promise<EntraCredentials> {
  const settings = await readEntraSettings()

  const missing: string[] = []
  if (!settings.tenantId)        missing.push('Tenant ID')
  if (!settings.clientId)        missing.push('Client ID')
  if (!settings.clientSecretEnc) missing.push('Client Secret')
  if (!settings.redirectUri)     missing.push('Redirect URI')

  if (missing.length > 0) {
    throw new Error(
      `Microsoft Entra ID SSO is not fully configured. ` +
      `Missing in Admin Panel → SSO Settings: ${missing.join(', ')}.`
    )
  }

  let clientSecret: string
  try {
    clientSecret = decryptSecret(settings.clientSecretEnc)
  } catch {
    throw new Error('Failed to decrypt Entra client secret — please re-enter it in Admin Panel → SSO Settings.')
  }

  return {
    tenantId:     settings.tenantId,
    clientId:     settings.clientId,
    clientSecret,
    redirectUri:  settings.redirectUri,
  }
}

/**
 * Upsert a single app_settings key.
 * Used by entra-save-settings.ts to write each credential individually.
 */
export async function upsertSetting(key: string, value: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`Failed to save setting "${key}": ${error.message}`)
}
