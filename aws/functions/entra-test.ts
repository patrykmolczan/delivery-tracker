/**
 * aws/functions/entra-test.ts
 * Microsoft Entra SSO connection test
 *
 * Thin Lambda wrapper — imports the original Vercel handler from api/entra-test.ts
 * and adapts it to Lambda's event/response contract via wrapLambdaHandler.
 */
import originalHandler from '../../api/entra-test'
import { wrapLambdaHandler } from '../lambda-adapter'

export const handler = wrapLambdaHandler(originalHandler)
