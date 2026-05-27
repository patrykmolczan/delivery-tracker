/**
 * aws/functions/generate-descriptions.ts
 * AI job description generator (GPT-4.1)
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/generate-descriptions.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/generate-descriptions'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
