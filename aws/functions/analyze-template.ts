/**
 * aws/functions/analyze-template.ts
 * Template quality analysis (GPT-4.1)
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/analyze-template.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/analyze-template'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
