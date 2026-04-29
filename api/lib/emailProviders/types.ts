export interface EmailPayload {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<void>
}
