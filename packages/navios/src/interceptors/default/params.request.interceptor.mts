import type { PreparedRequestConfig } from '../../types.mjs'

export function paramsRequestInterceptor(config: PreparedRequestConfig<any, any>) {
  if (!config.params || config.url.includes('?')) {
    return config
  }
  if (config.params instanceof config.URLSearchParams) {
    const search = config.params.toString()
    if (search.length > 0) {
      config.url = `${config.url}?${search}`
    }
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
  const search = params.toString()
  if (search.length > 0) {
    config.url = `${config.url}?${search}`
  }
  return config
}
