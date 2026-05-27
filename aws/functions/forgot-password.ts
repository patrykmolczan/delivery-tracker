/**
 * aws/functions/forgot-password.ts
 * Password reset email
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/forgot-password.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/forgot-password'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
