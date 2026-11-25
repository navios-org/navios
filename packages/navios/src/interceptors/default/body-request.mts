import type { PreparedRequestConfig } from '../../request/request-config.mjs'

function hasContentType(headers: Record<string, string> | undefined): boolean {
  return Object.keys(headers ?? {}).some((name) => name.toLowerCase() === 'content-type')
}

export function bodyRequestInterceptor(config: PreparedRequestConfig<any, any>) {
  // `fetch` rejects a GET or HEAD request that has a body
  if (config.body || config.method === 'GET' || config.method === 'HEAD') {
    return config
  }
  const { data } = config
  if (!data) {
    return config
  }
  if (data instanceof config.FormData || data instanceof FormData) {
    return {
      ...config,
      body: data,
    }
  }
  if (typeof data === 'string') {
    // A string is already serialized: it is sent as it is
    return {
      ...config,
      headers: hasContentType(config.headers)
        ? config.headers
        : { ...config.headers, 'Content-Type': 'text/plain' },
      body: data,
    }
  }
  if (typeof data === 'object') {
    return {
      ...config,
      headers: {
        ...config.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }
  }
  // Leave as is
  return config
}
