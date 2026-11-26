import { toTestMessage, toTestResponse } from '../adapter/test-exchange.mjs'

import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'

/**
 * Runs a test request in process, as a web `Request`. `handle` is given the
 * request and the path of its url, and answers as it answers one of the server.
 */
export async function injectRequest(
  request: TestRequest,
  handle: (request: Request, path: string) => Response | Promise<Response>,
): Promise<TestResponse> {
  const { method, url, headers, bytes } = await toTestMessage(request)
  const native = new Request(url, { method, headers: { ...headers }, body: bytes })
  const response = await handle(native, url.pathname)
  // The server drops the body of a `HEAD`. There is none here.
  const text = method === 'HEAD' ? '' : await response.text().catch(incomplete)
  return toTestResponse(response.status, response.headers, text)
}

/** A stream that failed, which has been reported. */
function incomplete(): never {
  throw new Error('[Navios] The response failed while it was being sent.')
}
