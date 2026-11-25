import type { PreparedRequestConfig } from '../../request/request-config.mjs'

/** Appends a query string, merging it into one the URL already has. */
function appendSearch(url: string, search: string): string {
  if (search.length === 0) {
    return url
  }
  if (!url.includes('?')) {
    return `${url}?${search}`
  }
  return url.endsWith('?') || url.endsWith('&') ? `${url}${search}` : `${url}&${search}`
}

export function paramsRequestInterceptor(config: PreparedRequestConfig<any, any>) {
  if (!config.params) {
    return config
  }
  if (config.params instanceof config.URLSearchParams) {
    config.url = appendSearch(config.url, config.params.toString())
    return config
  }
  const params: URLSearchParams = new config.URLSearchParams()
  for (const [key, value] of Object.entries(config.params)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item)
      }
      continue
    }
    if (typeof value === 'object') {
      if ('toISOString' in value && typeof value.toISOString === 'function') {
        params.append(key, value.toISOString())
      } else if ('toJSON' in value && typeof value.toJSON === 'function') {
        params.append(key, value.toJSON())
      } else {
        params.append(key, JSON.stringify(value))
      }
      continue
    }
    // @ts-ignore
    params.append(key, value)
  }
  config.url = appendSearch(config.url, params.toString())
  return config
}
