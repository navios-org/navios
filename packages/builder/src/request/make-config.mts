import type {
  AbstractRequestConfig,
  BaseEndpointOptions,
  EndpointResponseKind,
} from '../types/index.mjs'

import { parseSync } from './validate.mjs'

/**
 * Request type for config creation.
 */
export interface ConfigRequest {
  urlParams?: Record<string, unknown>
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
} as const satisfies Partial<Record<EndpointResponseKind, AbstractRequestConfig['responseType']>>

/**
 * Creates the request configuration object handed to the HTTP client.
 *
 * - Validates and parses query parameters with `querySchema` (if provided)
 * - Validates and parses the body with `requestSchema` (if provided)
 * - Converts the body to FormData when the endpoint declares `body: 'multipart'`
 * - Merges endpoint and per-call `headers` / `timeout`
 * - Merges `clientOptions` underneath the keys the builder owns
 *
 * Only the keys listed in `AbstractRequestConfig` plus the endpoint's
 * `clientOptions` reach the client. Call arguments the builder consumes
 * itself (`urlParams`) are never forwarded.
 *
 * @param request - The call arguments
 * @param options - Endpoint configuration
 * @param finalUrlPart - The URL with parameters bound
 * @throws If the query or body fails its schema (a `ZodError` for Zod schemas)
 *
 * @internal
 */
export function makeConfig<Options extends BaseEndpointOptions>(
  request: ConfigRequest,
  options: Options,
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

  const headers = {
    ...clientHeaders,
    ...options.headers,
    ...request.headers,
  }
  const timeout = request.timeout ?? options.timeout
  const responseType =
    options.response && options.response in RESPONSE_TYPES
      ? RESPONSE_TYPES[options.response as keyof typeof RESPONSE_TYPES]
      : undefined

  return {
    ...clientOptions,
    method: options.method,
    url: finalUrlPart,
    params: parseSync(options.querySchema, request.params ?? {}) as Record<string, unknown>,
    data:
      options.body === 'multipart'
        ? makeFormData(request, options)
        : parseSync(options.requestSchema, request.data),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(responseType !== undefined ? { responseType } : {}),
  }
}

/**
 * Serializes a value for inclusion in FormData.
 *
 * Handles various types:
 * - File instances are returned as-is
 * - null/undefined become empty strings
 * - Dates are converted to ISO strings
 * - Objects with toISOString or toJSON methods are serialized appropriately
 * - Other objects are JSON stringified
 * - Primitives are converted to strings
 *
 * @param value - The value to serialize
 * @returns A string representation or File instance
 * @internal
 */
function serializeFormDataValue(value: unknown): string | File {
  if (value instanceof File) {
    return value
  }
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
    // For toJSON:
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      const jsonValue = value.toJSON()
      return typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue)
    }
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Converts request data to FormData for multipart/form-data requests.
 *
 * The function:
 * - Validates the request data against `requestSchema` (if provided)
 * - Creates a FormData instance
 * - Appends all fields, handling File instances, arrays, and other types appropriately
 * - Files are appended with their name property
 * - Arrays of files are appended individually
 * - Other values are serialized using `serializeFormDataValue`
 *
 * @param request - The request parameters object
 * @param options - Endpoint configuration containing request schema
 * @returns A FormData instance ready for multipart requests
 *
 * @example
 * ```ts
 * const formData = makeFormData(
 *   { data: { file: new File(['content'], 'file.txt'), name: 'My File' } },
 *   { requestSchema: z.object({ file: z.instanceof(File), name: z.string() }) }
 * )
 * ```
 *
 * @internal
 */
export function makeFormData<Options extends BaseEndpointOptions>(
  request: ConfigRequest,
  options: Options,
) {
  const formData = new FormData()
  const validatedRequest = parseSync(options.requestSchema, request.data) as Record<string, unknown>
  if (!validatedRequest || typeof validatedRequest !== 'object') {
    return formData
  }

  for (const key in validatedRequest) {
    const value = validatedRequest[key]
    if (value instanceof File) {
      formData.append(key, value, value.name)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof File) {
          formData.append(key, item, item.name)
        } else {
          formData.append(key, serializeFormDataValue(item))
        }
      }
    } else {
      const serialized = serializeFormDataValue(value)
      if (serialized instanceof File) {
        formData.append(key, serialized, serialized.name)
      } else {
        formData.append(key, serialized)
      }
    }
  }
  return formData
}
