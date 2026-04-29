import { getEmailProvider } from './lib/emailProviders'
import { buildCompletionEmail, buildDeliveryFileEmail, buildStatusChangeEmail } from './lib/emailTemplates'

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, to, project, files, newStatus } = req.body || {}

  if (!type || !to || !project) {
    return res.status(400).json({ error: 'Missing required fields: type, to, project' })
  }

  try {
    const provider = getEmailProvider()

    let payload
    switch (type) {
      case 'completed':
        payload = buildCompletionEmail(to, project)
        break
      case 'delivery_file':
        payload = buildDeliveryFileEmail(to, project, files || [])
        break
      case 'status_changed':
        payload = buildStatusChangeEmail(to, project, newStatus || project.status)
        break
      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` })
    }

    await provider.send(payload)
    return res.status(200).json({ success: true, type, to })
  } catch (err: any) {
    console.error('[send-notification] Error:', err)
    return res.status(500).json({ error: err.message || 'Failed to send notification' })
  }
}
