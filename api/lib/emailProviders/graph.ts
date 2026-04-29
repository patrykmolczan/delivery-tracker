import type { EmailPayload, EmailProvider } from './types'

/**
 * Microsoft Graph API / Office 365 email provider.
 *
 * HOW TO SWAP TO O365:
 * 1. Set EMAIL_PROVIDER=graph in Vercel environment variables
 * 2. Set GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID, GRAPH_FROM_EMAIL
 * 3. Implement using the Microsoft Graph API:
 *    POST https://graph.microsoft.com/v1.0/users/{GRAPH_FROM_EMAIL}/sendMail
 *    Auth: Client credentials OAuth2 flow
 *
 * Requires IT to register an Azure App with Mail.Send permission (application type).
 */
export class GraphProvider implements EmailProvider {
  async send(_payload: EmailPayload): Promise<void> {
    throw new Error(
      'Microsoft Graph (O365) email provider not yet configured. ' +
      'Set EMAIL_PROVIDER=resend or contact IT to enable Azure App Registration.'
    )
  }
}
