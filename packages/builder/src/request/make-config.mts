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
