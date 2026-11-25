import type { AbstractRequestConfig } from './client.mjs'
import type { BaseEndpointOptions, EndpointResponseKind } from './endpoint-options.mjs'

/** The validated arguments of one call. */
export interface ConfigRequest {
  params?: Record<string, unknown>
  data?: unknown
  signal?: AbortSignal | null
  headers?: Record<string, string>
  timeout?: number
}

const RESPONSE_TYPES = {
  blob: 'blob',
  text: 'text',
  stream: 'stream',
  // A void response has no body worth parsing: asking for text keeps the
  // client from trying to parse an empty (or non-JSON) body as JSON.
  void: 'text',
} as const satisfies Partial<Record<EndpointResponseKind, AbstractRequestConfig['responseType']>>

const JSON_CONTENT_TYPE = /^\s*application\/(?:[\w.-]+\+)?json\s*(?:;|$)/i

/**
 * Merges headers; a later source replaces a header of the same name, however
 * either is spelled. Two spellings of one name would both be sent, joined into
 * one value.
 */
function mergeHeaders(...sources: (Record<string, string> | undefined)[]): Record<string, string> {
  const merged = new Map<string, [name: string, value: string]>()
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      if (value !== undefined) merged.set(name.toLowerCase(), [name, value])
    }
  }
  return Object.fromEntries(merged.values())
}

/**
 * Makes sure a primitive body is sent as JSON. Objects are left to the client;
 * a primitive is not recognised as JSON by clients: a string is sent as it is
 * (so it is encoded here), and others are dropped or refused unless the content
 * type says they are JSON.
 */
function encodePrimitive(data: unknown, headers: Record<string, string>): unknown {
  if (data === undefined || (typeof data === 'object' && data !== null)) return data
  const name = Object.keys(headers).find((key) => key.toLowerCase() === 'content-type')
  if (name === undefined) {
    headers['content-type'] = 'application/json'
  } else if (!JSON_CONTENT_TYPE.test(headers[name]!)) {
    return data
  }
  return typeof data === 'string' ? JSON.stringify(data) : data
}

/**
 * Creates the request configuration object handed to the HTTP client.
 *
 * - Converts the body to FormData when the endpoint declares `body: 'multipart'`
 * - Merges endpoint and per-call `headers` / `timeout`
 * - Merges `clientOptions` underneath the keys the builder owns
 *
 * Only the keys listed in `AbstractRequestConfig` plus the endpoint's
 * `clientOptions` reach the client. Call arguments the builder consumes
 * itself (`urlParams`) are never forwarded.
 *
 * @param request - The validated call arguments
 * @param options - Endpoint configuration
 * @param finalUrlPart - The URL with parameters bound
 */
export function makeConfig(
  request: ConfigRequest,
  options: BaseEndpointOptions,
  finalUrlPart: string,
): AbstractRequestConfig {
  // Builder-owned keys are stripped from clientOptions so they can never be
  // set from there, even when the builder itself has no value for them.
  const {
    headers: clientHeaders,
    method: _method,
    url: _url,
    params: _params,
    data: _data,
    signal: _signal,
    timeout: _timeout,
    responseType: _responseType,
    ...clientOptions
  } = (options.clientOptions ?? {}) as Record<string, unknown> & {
    headers?: Record<string, string>
  }

  const headers = mergeHeaders(clientHeaders, options.headers, request.headers)
  const data =
    options.body === 'multipart'
      ? makeFormData(request.data)
      : encodePrimitive(request.data, headers)
  const timeout = request.timeout ?? options.timeout
  const responseType =
    options.response && options.response in RESPONSE_TYPES
      ? RESPONSE_TYPES[options.response as keyof typeof RESPONSE_TYPES]
      : undefined

  return {
    ...clientOptions,
    method: options.method,
    url: finalUrlPart,
    params: request.params ?? {},
    data,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(responseType !== undefined ? { responseType } : {}),
  }
}

/**
 * Serializes a non-binary value for inclusion in FormData.
 *
 * - null becomes an empty string
 * - Dates (and anything with `toISOString`) become ISO strings
 * - Objects with `toJSON` use it; other objects are JSON stringified
 * - Primitives are converted to strings
 */
function serializeFormDataValue(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    if ('toISOString' in value && typeof value.toISOString === 'function') {
      return value.toISOString()
    }
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      const jsonValue = value.toJSON()
      return typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue)
    }
    return JSON.stringify(value)
  }
  return String(value)
}

/** Appends one field value: binary data as-is, everything else serialized. */
function appendFormDataValue(formData: FormData, key: string, value: unknown): void {
  if (typeof File !== 'undefined' && value instanceof File) {
    formData.append(key, value, value.name)
  } else if (value instanceof Blob) {
    formData.append(key, value)
  } else {
    formData.append(key, serializeFormDataValue(value))
  }
}

/**
 * Converts request data to FormData for multipart/form-data requests.
 *
 * - A `FormData` instance is sent as it is
 * - `File` and `Blob` values are appended as binary parts
 * - Arrays are appended once per item under the same key
 * - `undefined` fields are left out; `null` becomes an empty string
 * - Other values are serialized with `serializeFormDataValue`
 */
export function makeFormData(data: unknown): FormData {
  if (data instanceof FormData) {
    return data
  }

  const formData = new FormData()
  if (!data || typeof data !== 'object') {
    return formData
  }

  const fields = data as Record<string, unknown>
  for (const key of Object.keys(fields)) {
    const value = fields[key]
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) appendFormDataValue(formData, key, item)
      }
    } else {
      appendFormDataValue(formData, key, value)
    }
  }
  return formData
}
