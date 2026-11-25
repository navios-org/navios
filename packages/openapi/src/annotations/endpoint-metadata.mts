import { AttributeFactory } from '@navios/core'

import type { RouteInfo } from '@navios/core'

import { ApiDeprecatedAttribute } from './api-deprecated.mjs'
import { ApiExclude } from './api-exclude.mjs'
import { ApiOperation } from './api-operation.mjs'
import { ApiSecurity } from './api-security.mjs'
import { ApiStream } from './api-stream.mjs'
import { ApiSummary } from './api-summary.mjs'
import { ApiTagAttribute } from './api-tag.mjs'

import type { ApiOperationOptions } from './api-operation.mjs'
import type { ApiSecurityRequirement } from './api-security.mjs'
import type { ApiStreamOptions } from './api-stream.mjs'
import type { ApiTagOptions } from './api-tag.mjs'

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
