import type { ControllerMetadata, HandlerMetadata } from '@navios/core'

import { Injectable } from '@navios/core'

import type { OpenApiEndpointMetadata } from '../metadata/openapi.metadata.mjs'

import {
  ApiDeprecatedToken,
  ApiExcludeToken,
  ApiOperationToken,
  ApiSecurityToken,
  ApiStreamToken,
  ApiSummaryToken,
  ApiTagToken,
} from '../tokens/index.mjs'

/**
 * Service responsible for extracting OpenAPI metadata from decorators.
 *
 * Merges controller-level and handler-level metadata to produce
 * a complete OpenAPI metadata object for each endpoint.
 */
@Injectable()
export class MetadataExtractorService {
  /**
   * Extracts and merges OpenAPI metadata from controller and handler.
   *
   * @param controller - Controller metadata
   * @param handler - Handler metadata
   * @returns Merged OpenAPI metadata
   */
  extract(
    controller: ControllerMetadata,
    handler: HandlerMetadata<any>,
  ): OpenApiEndpointMetadata {
    // Extract controller-level metadata
    const controllerTag = controller.customAttributes.get(ApiTagToken) as
      | { name: string; description?: string }
      | undefined

    // Extract handler-level metadata
    const handlerTag = handler.customAttributes.get(ApiTagToken) as
      | { name: string; description?: string }
      | undefined
    const operation = handler.customAttributes.get(ApiOperationToken) as
      | {
          summary?: string
          description?: string
          operationId?: string
          deprecated?: boolean
          externalDocs?: { url: string; description?: string }
        }
      | undefined
    const summary = handler.customAttributes.get(ApiSummaryToken) as
      | string
      | undefined
    const deprecated = handler.customAttributes.get(ApiDeprecatedToken) as
      | { message?: string }
      | undefined
    const security = handler.customAttributes.get(ApiSecurityToken) as
      | Record<string, string[]>
      | undefined
    const excluded = handler.customAttributes.get(ApiExcludeToken) as
      | boolean
      | undefined
    const stream = handler.customAttributes.get(ApiStreamToken) as
      | { contentType: string; description?: string }
      | undefined

    // Build tags array (handler tag takes precedence but both are included)
    const tags: string[] = []
    if (controllerTag?.name) {
      tags.push(controllerTag.name)
    }
    if (handlerTag?.name && handlerTag.name !== controllerTag?.name) {
      tags.push(handlerTag.name)
    }

    return {
      tags,
      summary: operation?.summary ?? summary,
      description: operation?.description,
      operationId: operation?.operationId,
      deprecated: deprecated !== undefined || operation?.deprecated === true,
      externalDocs: operation?.externalDocs,
      security: security ? [security] : undefined,
      excluded: excluded === true,
      stream,
    }
  }
}
