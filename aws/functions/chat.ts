/**
 * aws/functions/chat.ts
 * AI Insights chat proxy (GPT-4.1)
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/chat.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/chat'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
