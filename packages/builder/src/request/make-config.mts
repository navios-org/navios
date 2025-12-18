import type { ZodType } from 'zod/v4'

import type {
  AbstractRequestConfig,
  BaseStreamConfig,
  HttpMethod,
  NaviosZodRequest,
} from '../types/index.mjs'

function parseWithSchema(schema: ZodType | undefined, value: unknown): unknown {
  return schema ? schema.parse(value) : value
}

/**
 * Creates a request configuration object for the HTTP client.
 *
 * This function:
 * - Validates and parses query parameters using `querySchema` (if provided)
 * - Validates and parses request body data using `requestSchema` (if provided)
 * - Converts request data to FormData if `isMultipart` is true
 * - Merges all request properties (headers, signal, etc.) into the final config
 *
 * @param request - The request parameters object
 * @param options - Endpoint configuration containing schemas
 * @param method - HTTP method to use
 * @param finalUrlPart - The final URL with parameters bound
 * @param isMultipart - Whether to convert the request data to FormData
 * @returns A request configuration object compatible with the Client interface
 *
 * @internal
 */
export function makeConfig<Config extends BaseStreamConfig>(
  request: NaviosZodRequest<Config>,
  options: Config,
  method: HttpMethod,
  finalUrlPart: string,
  isMultipart = false,
) {
  return {
    ...request,
    params: parseWithSchema(options.querySchema as ZodType | undefined, request.params ?? {}) as Record<string, unknown>,
    method,
    url: finalUrlPart,
    data: isMultipart
      ? makeFormData(request, options)
      : parseWithSchema(options.requestSchema as ZodType | undefined, request.data),
  } satisfies AbstractRequestConfig
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
  if (typeof value === 'number' || typeof value === 'boolean') {
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
      return String(value.toJSON())
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
export function makeFormData<Config extends BaseStreamConfig>(
  request: NaviosZodRequest<Config>,
  options: Config,
) {
  const formData = new FormData()
  const validatedRequest = parseWithSchema(
    options.requestSchema as ZodType | undefined,
    request.data,
  ) as Record<string, unknown>
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
