/**
 * aws/functions/chat.ts
 * AI Insights chat proxy (GPT-4.1)
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/chat.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/chat'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
