/**
 * aws/functions/entra-save-settings.ts
 * Microsoft Entra SSO settings
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/entra-save-settings.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/entra-save-settings'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
