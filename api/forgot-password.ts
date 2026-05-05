import { getEmailProvider } from './lib/emailProviders'
import { buildPasswordResetEmail } from './lib/emailTemplates'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://slgtojndmckisjdplhcs.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = process.env.VITE_APP_URL || 'https://delivery-tracker-ashen.vercel.app'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Email is required' })

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: APP_URL },
    })

    if (linkError) {
      // Don't reveal whether user exists — silently succeed
      console.error('[forgot-password] generateLink error:', linkError.message)
      return res.status(200).json({ success: true })
    }

    // Use hashed_token to build a link that points to OUR app, not Supabase's verify endpoint.
    // Email security scanners (Mimecast, Proofpoint) pre-fetch every URL in emails to scan
    // for malware — this consumes the one-time Supabase verify token before the user clicks.
    // Our app URL is safe to pre-fetch (just a React shell). The token is only exchanged
    // when the user's browser runs AuthContext.verifyOtp() on mount.
    const hashedToken = linkData?.properties?.hashed_token
    if (!hashedToken) {
      console.error('[forgot-password] No hashed_token in response')
      return res.status(200).json({ success: true })
    }
    const resetLink = `${APP_URL}?token_hash=${hashedToken}&type=recovery`

    const provider = getEmailProvider()
    const payload = await buildPasswordResetEmail(email, resetLink)
    await provider.send(payload)

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('[forgot-password] Error:', err)
    // Always return success to prevent email enumeration
    return res.status(200).json({ success: true })
  }
}
