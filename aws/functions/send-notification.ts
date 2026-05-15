/**
 * aws/functions/send-notification.ts
 * Email notification sender
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/send-notification.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/send-notification'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
