import type { EmailProvider } from './types'
import { ResendProvider } from './resend'
import { GraphProvider } from './graph'

export function getEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase()
  switch (provider) {
    case 'graph':
    case 'o365':
    case 'outlook':
      return new GraphProvider()
    case 'resend':
    default:
      return new ResendProvider()
  }
}

export type { EmailPayload, EmailProvider } from './types'
