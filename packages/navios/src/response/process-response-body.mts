import type { NaviosRequestConfig } from '../request/request-config.mjs'

/**
 * Parses a body that is expected to be JSON.
 *
 * An empty body (a 204, `content-length: 0`, ...) is `undefined` instead of a
 * `SyntaxError`. A body that is not JSON throws a `SyntaxError` that carries
 * the text that was read as `body`.
 */
export function parseJsonBody(text: string): unknown {
  if (text === '') {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw Object.assign(
      new SyntaxError(`Response body is not valid JSON: ${(cause as Error).message}`, { cause }),
      { body: text },
    )
  }
}

export async function processResponseBody(
  response: Response,
  finalConfig: NaviosRequestConfig<any, any>,
): Promise<any> {
  switch (finalConfig.responseType) {
    case 'blob':
      return response.blob()
    case 'arrayBuffer':
      return response.arrayBuffer()
    case 'formData':
      return response.formData()
    case 'stream':
      return response.body
    case 'json':
      // The body is read once as text, so an empty one can be told apart
      // from a malformed one and the text is still there to report.
      return parseJsonBody(await response.text())
    case 'text':
    default:
      return response.text()
  }
}
