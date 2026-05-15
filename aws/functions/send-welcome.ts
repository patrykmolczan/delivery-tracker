/**
 * aws/functions/send-welcome.ts
 * Welcome email for new users
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/send-welcome.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/send-welcome'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
