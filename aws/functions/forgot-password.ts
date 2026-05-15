/**
 * aws/functions/forgot-password.ts
 * Password reset email
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/forgot-password.ts
 * and adapts it to Lambda's event/response contract via wrapVercelHandler.
 */
import originalHandler from '../../api/forgot-password'
import { wrapVercelHandler } from '../lambda-adapter'

export const handler = wrapVercelHandler(originalHandler)
