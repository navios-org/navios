import type { NaviosApplication } from '../application/navios-application.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * `fetch` for an application without a server: the request goes through
 * `inject()`.
 * @internal
 */
export async function injectFetch(
  app: NaviosApplication<any>,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const { pathname, search } = new URL(url)
  const { status, headers, text } = await app.inject({
    method: init.method ?? 'GET',
    url: `${pathname}${search}`,
    headers: Object.fromEntries(new Headers(init.headers)),
    body: init.body ?? undefined,
  })
  const native = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    for (const line of name === 'set-cookie' ? value.split('\n') : [value]) {
      native.append(name, line)
    }
  }
  const hasBody = status !== 204 && status !== 205 && status !== 304
  // As bytes: for a string, `Response` would add a content type.
  return new Response(hasBody ? new TextEncoder().encode(text) : null, { status, headers: native })
}
