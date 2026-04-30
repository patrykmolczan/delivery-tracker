/**
 * api/send-welcome.ts
 * --------------------
 * Vercel serverless function — sends welcome email to newly created users.
 * Called by BulkUserPage after bulk creation and by AdminPage for individual resend.
 *
 * POST body: { to: string, full_name: string, temp_password: string }
 *
 * Note: temp_password is the plaintext temp password generated client-side.
 * It is transmitted over HTTPS and used only to populate the email body.
 * The actual password in Supabase Auth is already stored as a bcrypt hash.
 *
 * Rate limiting: caller is responsible for 5s delays between bulk sends.
 */

import { getEmailProvider } from './lib/emailProviders'
import { buildWelcomeEmail } from './lib/emailTemplates'

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, full_name, temp_password } = req.body || {}

  if (!to || !temp_password) {
    return res.status(400).json({ error: 'Missing required fields: to, temp_password' })
  }

  try {
    const provider = getEmailProvider()
    const payload = await buildWelcomeEmail(to, full_name || to, temp_password)
    await provider.send(payload)
    return res.status(200).json({ success: true, to })
  } catch (err: any) {
    console.error('[send-welcome] Error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send welcome email' })
  }
}
