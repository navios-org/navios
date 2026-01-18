import { NaviosError, NaviosInternalError } from '../../NaviosError.mjs'

import type { NaviosResponse } from '../../types.mjs'

export function jsonResponseInterceptor(response: NaviosResponse<any>) {
  const contentType = response.headers.get('content-type')
  if (
    contentType &&
    contentType.includes('application/json') &&
    typeof response.data === 'string'
  ) {
    return {
      ...response,
      data: JSON.parse(response.data),
    }
  }
  return response
}

export async function jsonErrorInterceptor(err: NaviosInternalError) {
  if (!err.response || !(err.response instanceof Response)) {
    throw err
  }
  const contentType = err.response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    throw new NaviosError(
      err.message,
      {
        headers: err.response.headers,
        status: err.response.status ?? 418,
        statusText: err.response.statusText ?? "I'm a teapot",
        data: await err.response.json(),
      } satisfies NaviosResponse<any>,
      err.config,
    )
  } else {
    throw new NaviosError(
      err.message,
      {
        headers: err.response.headers,
        status: err.response.status ?? 418,
        statusText: err.response.statusText ?? "I'm a teapot",
        data: await err.response.text(),
      },
      err.config,
    )
  }
  throw err
}
