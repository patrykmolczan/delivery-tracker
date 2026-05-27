/**
 * aws/functions/entra-login.ts
 * Microsoft Entra SSO login initiation
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/entra-login.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/entra-login'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
