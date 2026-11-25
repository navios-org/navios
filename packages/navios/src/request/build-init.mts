import { isJsonContentType } from '../is-json-content-type.mjs'

import { METHODS_WITHOUT_BODY } from './http-method.mjs'
import { isInstance } from './is-instance.mjs'
import { mergeHeaders } from './merge-headers.mjs'

import type { PreparedRequestConfig } from './request-config.mjs'

/** Bodies `fetch` sends by itself, besides strings and views of a buffer. */
const FETCH_BODIES = ['URLSearchParams', 'Blob', 'File', 'ArrayBuffer', 'ReadableStream']

function isFormData(data: unknown, config: PreparedRequestConfig): boolean {
  return (
    isInstance(data, 'FormData') ||
    (config.FormData !== undefined && data instanceof config.FormData)
  )
}

/**
 * Builds what is passed to `fetch` from the config, which stays as the
 * interceptors left it, so that it can be sent again.
 *
 * @throws when the body cannot be serialised
 */
export function buildInit(config: PreparedRequestConfig): RequestInit {
  const {
    url: _url,
    baseURL: _baseURL,
    params: _params,
    data,
    timeout: _timeout,
    responseType: _responseType,
    validateStatus: _validateStatus,
    withCredentials,
    FormData: _FormData,
    URLSearchParams: _URLSearchParams,
    ...rest
  } = config

  const headers = mergeHeaders(config.headers)
  const init: RequestInit & { duplex?: 'half' } = { ...rest, headers }
  if (withCredentials && config.credentials === undefined) {
    init.credentials = 'include'
  }

  if (data === undefined || config.body != null || METHODS_WITHOUT_BODY.includes(config.method)) {
    return init
  }
  if (isFormData(data, config)) {
    // `fetch` adds the content type, with the boundary it chose
    delete headers['content-type']
    init.body = data as FormData
  } else if (typeof data === 'string') {
    // A string is already serialised: it is sent as it is
    headers['content-type'] ??= 'text/plain'
    init.body = data
  } else if (ArrayBuffer.isView(data) || FETCH_BODIES.some((name) => isInstance(data, name))) {
    init.body = data as BodyInit
    if (isInstance(data, 'ReadableStream')) init.duplex = 'half'
  } else if (data !== null || isJsonContentType(headers['content-type'])) {
    // `null` is a JSON value only where JSON is asked for, and otherwise no body
    init.body = JSON.stringify(data)
    headers['content-type'] ??= 'application/json'
  }
  return init
}
