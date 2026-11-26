import { AttributeFactory } from '@navios/server'

import type { RouteInfo, StandardSchemaV1 } from '@navios/server'

import { isObject } from '../json-schema/index.mjs'

/**
 * The documentation attributes. Every one works as a decorator on a module, a
 * controller, a handler method or a `handler()` field, and as a value in
 * `handler(endpoint, { attributes: [ApiSummary('...')] }, fn)`.
 *
 * Their value schemas are hand-written Standard Schemas so that the package
 * needs no schema library at runtime. `@navios/openapi/legacy-compat` builds
 * the legacy decorators from the same tokens, schemas and values.
 */

function valueSchema<T>(check: (value: unknown) => string | null): StandardSchemaV1<T, T> {
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

function optionalField(
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

// ApiDeprecated

/** Token for @ApiDeprecated decorator */
export const ApiDeprecatedToken = Symbol.for('navios:openapi:deprecated')

export interface ApiDeprecatedOptions {
  message?: string
}

/** @internal */
export const ApiDeprecatedSchema = valueSchema<ApiDeprecatedOptions>((value) =>
  isObject(value) ? optionalField(value, 'message', 'string') : 'expected an object',
)

/** @internal The value `ApiDeprecated(message)` stores. */
export function apiDeprecatedValue(message?: string): ApiDeprecatedOptions {
  return message === undefined ? {} : { message }
}

const ApiDeprecatedAttribute = AttributeFactory.createAttribute(
  ApiDeprecatedToken,
  ApiDeprecatedSchema,
)

/**
 * Marks an operation as deprecated. On a controller or a module it marks
 * every operation below it.
 */
export function ApiDeprecated(message?: string) {
  return ApiDeprecatedAttribute(apiDeprecatedValue(message))
}

// ApiExclude

/** Token for @ApiExclude decorator */
export const ApiExcludeToken = Symbol.for('navios:openapi:exclude')

/**
 * Leaves an operation out of the document. On a controller or a module it
 * leaves out everything below it.
 */
export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)

// ApiOperation

/** Token for @ApiOperation decorator */
export const ApiOperationToken = Symbol.for('navios:openapi:operation')

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

/** @internal */
export const ApiOperationSchema = valueSchema<ApiOperationOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  const { externalDocs } = value
  if (externalDocs !== undefined) {
    if (!isObject(externalDocs) || typeof externalDocs.url !== 'string') {
      return '"externalDocs" must be an object with a string "url"'
    }
    const error = optionalField(externalDocs, 'description', 'string')
    if (error) {
      return `externalDocs: ${error}`
    }
  }
  return firstError(
    optionalField(value, 'summary', 'string'),
    optionalField(value, 'description', 'string'),
    optionalField(value, 'operationId', 'string'),
    optionalField(value, 'deprecated', 'boolean'),
  )
})

/**
 * Operation metadata: `summary`, `description`, `operationId`, `deprecated`
 * and `externalDocs`. Read from the handler only.
 */
export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)

// ApiSecurity

/** Token for @ApiSecurity decorator */
export const ApiSecurityToken = Symbol.for('navios:openapi:security')

/** Maps a security scheme name to the scopes it requires. */
export type ApiSecurityRequirement = Record<string, string[]>

/** @internal */
export const ApiSecuritySchema = valueSchema<ApiSecurityRequirement>((value) => {
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

/**
 * Security requirements of an operation: scheme name to scopes. The most
 * specific level wins (handler, then controller, then module).
 */
export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)

// ApiStream

/** Token for @ApiStream decorator */
export const ApiStreamToken = Symbol.for('navios:openapi:stream')

export interface ApiStreamOptions {
  contentType: string
  description?: string
}

/** @internal */
export const ApiStreamSchema = valueSchema<ApiStreamOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.contentType !== 'string') {
    return '"contentType" must be a string'
  }
  return optionalField(value, 'description', 'string')
})

/**
 * The content type and description of a `response: 'stream' | 'text' | 'blob'`
 * endpoint. Read from the handler only.
 */
export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)

// ApiSummary

/** Token for @ApiSummary decorator */
export const ApiSummaryToken = Symbol.for('navios:openapi:summary')

/** @internal */
export const ApiSummarySchema = valueSchema<string>((value) =>
  typeof value === 'string' ? null : 'expected a string',
)

/** Shorthand for `ApiOperation({ summary })`. Read from the handler only. */
export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)

// ApiTag

/** Token for @ApiTag decorator */
export const ApiTagToken = Symbol.for('navios:openapi:tag')

export interface ApiTagOptions {
  name: string
  description?: string
}

/** @internal */
export const ApiTagSchema = valueSchema<ApiTagOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.name !== 'string') {
    return '"name" must be a string'
  }
  return optionalField(value, 'description', 'string')
})

/** @internal The value `ApiTag(name, description)` stores. */
export function apiTagValue(name: string, description?: string): ApiTagOptions {
  return description === undefined ? { name } : { name, description }
}

const ApiTagAttribute = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

/**
 * Groups operations under a tag. On a module or a controller it applies to
 * every handler below it; tags from all three levels are combined.
 *
 * ```ts
 * @ApiTag('Users', 'User management')
 * @Controller()
 * export class UsersController {}
 * ```
 */
export function ApiTag(name: string, description?: string) {
  return ApiTagAttribute(apiTagValue(name, description))
}

// Reading

/**
 * What the documentation attributes say about one route.
 */
export interface OpenApiEndpointMetadata {
  /** Tag names: module's, then controller's, then handler's. */
  tags: string[]
  /** The tags with their descriptions, in the same order. */
  tagDefinitions: ApiTagOptions[]
  summary?: string
  description?: string
  operationId?: string
  deprecated: boolean
  deprecationMessage?: string
  security?: ApiSecurityRequirement[]
  externalDocs?: ApiOperationOptions['externalDocs']
  /** Content type and description of a stream, text or blob response. */
  stream?: ApiStreamOptions
  excluded: boolean
}

/**
 * Reads the documentation attributes of a route (an entry of `app.routes()`,
 * or `ctx.route`).
 *
 * - `ApiTag`: combined from module, controller and handler.
 * - `ApiDeprecated`, `ApiSecurity`, `ApiExclude`: the most specific level
 *   that has it, so one on a controller covers all its handlers.
 * - `ApiOperation`, `ApiSummary`, `ApiStream`: the handler's only.
 */
export function extractOpenApiMetadata(route: RouteInfo): OpenApiEndpointMetadata {
  const handler = { attributes: route.attributes.handler }

  const tagDefinitions: ApiTagOptions[] = []
  // getAll is most specific first; tags read better outermost first.
  for (const tag of AttributeFactory.getAll(ApiTagAttribute, route).reverse()) {
    if (!tagDefinitions.some((existing) => existing.name === tag.name)) {
      tagDefinitions.push(tag)
    }
  }

  const operation = AttributeFactory.get(ApiOperation, handler)
  const summary = AttributeFactory.get(ApiSummary, handler)
  const deprecated = AttributeFactory.get(ApiDeprecatedAttribute, route)
  const security = AttributeFactory.get(ApiSecurity, route)
  const stream = AttributeFactory.get(ApiStream, handler)

  return {
    tags: tagDefinitions.map((tag) => tag.name),
    tagDefinitions,
    summary: operation?.summary ?? summary ?? undefined,
    description: operation?.description,
    operationId: operation?.operationId,
    deprecated: deprecated !== null || operation?.deprecated === true,
    deprecationMessage: deprecated?.message,
    externalDocs: operation?.externalDocs,
    security: security ? [security] : undefined,
    stream: stream ?? undefined,
    excluded: AttributeFactory.has(ApiExclude, route),
  }
}
