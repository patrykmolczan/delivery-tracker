import { getEmailProvider } from './lib/emailProviders'
import { buildWelcomeEmail } from './lib/emailTemplates'

export default async function handler(req: any, res: any) {
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
    const payload  = await buildWelcomeEmail(to, full_name || to, temp_password)
    await provider.send(payload)
    return res.status(200).json({ success: true, to })
  } catch (err: any) {
    console.error('[send-welcome] Error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send welcome email' })
  }
}
