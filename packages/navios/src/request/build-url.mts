import { isInstance } from './is-instance.mjs'

import type { PreparedRequestConfig } from './request-config.mjs'

/**
 * Only a scheme makes a URL absolute. `//host/path` does not: a doubled slash
 * in a path must not send the request, with its credentials, to another host.
 */
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i

function joinUrl(baseURL: string, url: string): string {
  if (!baseURL || ABSOLUTE_URL.test(url)) return url
  return url ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : baseURL
}

/** Appends a query string, merging it into one the URL already has, before a fragment. */
function appendSearch(url: string, search: string): string {
  if (search === '') return url
  const hash = url.indexOf('#')
  const base = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash)
  let separator = '?'
  if (base.includes('?')) {
    separator = base.endsWith('?') || base.endsWith('&') ? '' : '&'
  }
  return `${base}${separator}${search}${fragment}`
}

function serialize(value: unknown): string {
  if (typeof value !== 'object' || value === null) return String(value)
  if ('toISOString' in value && typeof value.toISOString === 'function') {
    return String(value.toISOString())
  }
  const json: unknown =
    'toJSON' in value && typeof value.toJSON === 'function' ? value.toJSON() : value
  return typeof json === 'string' ? json : JSON.stringify(json)
}

function serializeParams(config: PreparedRequestConfig): string {
  const { params } = config
  if (!params) return ''
  if (
    isInstance(params, 'URLSearchParams') ||
    (config.URLSearchParams && params instanceof config.URLSearchParams)
  ) {
    return params.toString()
  }
  const search = new (config.URLSearchParams ?? URLSearchParams)()
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      search.append(key, serialize(item))
    }
  }
  return search.toString()
}

export function buildUrl(config: PreparedRequestConfig): string {
  return appendSearch(joinUrl(config.baseURL, config.url), serializeParams(config))
}
