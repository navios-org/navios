import { toTestMessage, toTestResponse } from '@navios/server/adapter'

import type { TestRequest, TestResponse } from '@navios/server/adapter'

/** Runs a test request in process. */
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
