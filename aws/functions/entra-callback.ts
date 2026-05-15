/**
 * aws/functions/entra-callback.ts
 * Microsoft Entra SSO OAuth callback
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/entra-callback.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/entra-callback'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
