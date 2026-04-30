import type { EmailPayload, EmailProvider } from './types'

export class ResendProvider implements EmailProvider {
  private apiKey: string
  private fromAddress: string

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || ''
    const name = process.env.RESEND_FROM_NAME || 'Delivery Tracker'
    const email = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    this.fromAddress = `${name} <${email}>`
  }

  async send(payload: EmailPayload): Promise<void> {
    if (!this.apiKey) throw new Error('RESEND_API_KEY not configured')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Resend API error ${res.status}: ${err}`)
    }
  }
}
