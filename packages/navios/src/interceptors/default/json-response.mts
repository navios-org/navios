import { NaviosError, NaviosInternalError } from '../../navios-error.mjs'
import { parseJsonBody } from '../../response/process-response-body.mjs'

import type { NaviosResponse } from '../../response/navios-response.mjs'

export function jsonResponseInterceptor(response: NaviosResponse<any>) {
  const contentType = response.headers.get('content-type')
  if (
    contentType &&
    contentType.includes('application/json') &&
    typeof response.data === 'string'
  ) {
    try {
      return {
        ...response,
        data: JSON.parse(response.data),
      }
    } catch {
      // Not JSON after all: the text stays as it is
    }
  }
  return response
}

export async function jsonErrorInterceptor(err: NaviosInternalError) {
  if (!err.response) {
    throw err
  }
  if (!(err.response instanceof Response)) {
    // The body was already read (it could not be parsed)
    const error = new NaviosError(err.message, err.response, err.config)
    error.cause = err.cause
    throw error
  }
  const contentType = err.response.headers.get('content-type')
  const text = await err.response.text()
  let data: unknown = text
  if (contentType && contentType.includes('application/json')) {
    try {
      data = parseJsonBody(text)
    } catch {
      // A malformed error body must not hide the status: the text is kept
    }
  }
  throw new NaviosError(
    err.message,
    {
      headers: err.response.headers,
      status: err.response.status ?? 418,
      statusText: err.response.statusText ?? "I'm a teapot",
      data,
    } satisfies NaviosResponse<any>,
    err.config,
  )
}
