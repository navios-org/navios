import type { StandardSchemaV1 } from '@navios/core'

/**
 * The value schemas of the documentation attributes. They are hand-written
 * Standard Schemas so that the package needs no schema library at runtime.
 */

function schema<T>(check: (value: unknown) => string | null): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'navios',
      validate: (value) => {
        const message = check(value)
        return message === null ? { value: value as T } : { issues: [{ message }] }
      },
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optional(
  value: Record<string, unknown>,
  key: string,
  type: 'string' | 'boolean',
): string | null {
  return value[key] === undefined || typeof value[key] === type
    ? null
    : `"${key}" must be a ${type}`
}

function firstError(...errors: Array<string | null>): string | null {
  return errors.find((error) => error !== null) ?? null
}

export interface ApiTagOptions {
  name: string
  description?: string
}

export const ApiTagSchema = schema<ApiTagOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.name !== 'string') {
    return '"name" must be a string'
  }
  return optional(value, 'description', 'string')
})

export interface ApiOperationOptions {
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  externalDocs?: {
    url: string
    description?: string
  }
}

export const ApiOperationSchema = schema<ApiOperationOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  const { externalDocs } = value
  if (externalDocs !== undefined) {
    if (!isObject(externalDocs) || typeof externalDocs.url !== 'string') {
      return '"externalDocs" must be an object with a string "url"'
    }
    const error = optional(externalDocs, 'description', 'string')
    if (error) {
      return `externalDocs: ${error}`
    }
  }
  return firstError(
    optional(value, 'summary', 'string'),
    optional(value, 'description', 'string'),
    optional(value, 'operationId', 'string'),
    optional(value, 'deprecated', 'boolean'),
  )
})

export const ApiSummarySchema = schema<string>((value) =>
  typeof value === 'string' ? null : 'expected a string',
)

export interface ApiDeprecatedOptions {
  message?: string
}

export const ApiDeprecatedSchema = schema<ApiDeprecatedOptions>((value) =>
  isObject(value) ? optional(value, 'message', 'string') : 'expected an object',
)

/** Maps a security scheme name to the scopes it requires. */
export type ApiSecurityRequirement = Record<string, string[]>

export const ApiSecuritySchema = schema<ApiSecurityRequirement>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  for (const [name, scopes] of Object.entries(value)) {
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
      return `"${name}" must be an array of strings`
    }
  }
  return null
})

export interface ApiStreamOptions {
  contentType: string
  description?: string
}

export const ApiStreamSchema = schema<ApiStreamOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.contentType !== 'string') {
    return '"contentType" must be a string'
  }
  return optional(value, 'description', 'string')
})
