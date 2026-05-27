/**
 * aws/lambda-adapter.ts
 *
 * Wraps serverless-style handlers (req, res) for AWS Lambda + API Gateway HTTP API v2.
 * Allows existing api/ handlers to run on Lambda without any code changes.
 *
 * Simulated req surface:
 *   req.method, req.body (parsed JSON), req.headers (lowercase), req.ip, req.socket.remoteAddress
 *
 * Simulated res surface:
 *   res.status(code).json(data)
 *   res.status(code).end()
 *   res.setHeader(key, value)
 */

export type ServerlessHandler = (req: any, res: any) => Promise<void>

export function wrapLambdaHandler(serverlessHandler: ServerlessHandler) {
  return async (event: any): Promise<any> => {
    // ── Method ────────────────────────────────────────────────────────────────
    const method = (
      event.requestContext?.http?.method ||
      event.httpMethod ||
      'GET'
    ).toUpperCase()

    // ── Body ──────────────────────────────────────────────────────────────────
    let body: any = {}
    if (event.body) {
      try {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body
        body = JSON.parse(raw)
      } catch {
        body = event.body
      }
    }

    // ── Headers (normalize to lowercase) ──────────────────────────────────────
    const rawHeaders = event.headers || {}
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k.toLowerCase()] = v as string
    }

    // ── Source IP (for rate limiting) ─────────────────────────────────────────
    const sourceIp =
      event.requestContext?.http?.sourceIp ||
      event.requestContext?.identity?.sourceIp ||
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      '127.0.0.1'

    // ── Simulated request object ──────────────────────────────────────────────
    const req: any = {
      method,
      body,
      headers,
      ip: sourceIp,
      socket: { remoteAddress: sourceIp },
    }

    // ── Collect response state ────────────────────────────────────────────────
    let statusCode = 200
    let responseBody = ''
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // ── Simulated response object ─────────────────────────────────────────────
    const res: any = {
      setHeader(key: string, value: string | number) {
        responseHeaders[key] = String(value)
      },
      status(code: number) {
        statusCode = code
        return {
          json(data: any) {
            responseBody = JSON.stringify(data)
          },
          end() {
            responseBody = ''
          },
          send(data: any) {
            responseBody = typeof data === 'string' ? data : JSON.stringify(data)
          },
        }
      },
      json(data: any) {
        responseBody = JSON.stringify(data)
      },
      end() {
        responseBody = ''
      },
    }

    await serverlessHandler(req, res)

    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody,
    }
  }
}
-e 
/** @deprecated Use wrapLambdaHandler instead. */
export const wrapVercelHandler = wrapLambdaHandler
