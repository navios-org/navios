import type { BaseEndpointConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'
import type { oas31 } from 'zod-openapi'

import {
  EndpointAdapterToken,
  inject,
  Injectable,
  MultipartAdapterToken,
  StreamAdapterToken,
} from '@navios/core'

import type { DiscoveredEndpoint } from './endpoint-scanner.service.mjs'

import { SchemaConverterService } from './schema-converter.service.mjs'

type ContentObject = oas31.ContentObject
type OperationObject = oas31.OperationObject
type ParameterObject = oas31.ParameterObject
type PathItemObject = oas31.PathItemObject
type RequestBodyObject = oas31.RequestBodyObject
type ResponsesObject = oas31.ResponsesObject
type SchemaObject = oas31.SchemaObject

/**
 * Result of path item generation
 */
export interface PathItemResult {
  path: string
  pathItem: PathItemObject
}

/**
 * Service responsible for building OpenAPI path items from endpoints.
 *
 * Handles URL parameter conversion, request body generation,
 * and response schema generation for different endpoint types.
 */
@Injectable()
export class PathBuilderService {
  private readonly schemaConverter = inject(SchemaConverterService)

  /**
   * Generates an OpenAPI path item for a discovered endpoint.
   *
   * @param endpoint - Discovered endpoint with metadata
   * @returns Path string and path item object
   */
  build(endpoint: DiscoveredEndpoint): PathItemResult {
    const { config, handler, openApiMetadata } = endpoint

    // Convert $param to {param} format for OpenAPI
    const path = this.convertUrlParams(config.url)

    const operation: OperationObject = {
      tags: openApiMetadata.tags.length > 0 ? openApiMetadata.tags : undefined,
      summary: openApiMetadata.summary,
      description: openApiMetadata.description,
      operationId: openApiMetadata.operationId,
      deprecated: openApiMetadata.deprecated || undefined,
      externalDocs: openApiMetadata.externalDocs,
      security: openApiMetadata.security,
      parameters: this.buildParameters(config),
      requestBody: this.buildRequestBody(config, handler),
      responses: this.buildResponses(endpoint),
    }

    // Remove undefined properties
    const cleanOperation = Object.fromEntries(
      Object.entries(operation).filter(([, v]) => v !== undefined),
    ) as OperationObject

    return {
      path,
      pathItem: {
        [config.method.toLowerCase()]: cleanOperation,
      },
    }
  }

  /**
   * Converts Navios URL param format ($param) to OpenAPI format ({param})
   */
  convertUrlParams(url: string): string {
    return url.replace(/\$(\w+)/g, '{$1}')
  }

  /**
   * Extracts URL parameter names from a URL pattern
   */
  extractUrlParamNames(url: string): string[] {
    const matches = url.matchAll(/\$(\w+)/g)
    return Array.from(matches, (m) => m[1])
  }

  /**
   * Gets the endpoint type based on the adapter token
   */
  getEndpointType(
    handler: HandlerMetadata<any>,
  ): 'endpoint' | 'multipart' | 'stream' {
    if (handler.adapterToken === MultipartAdapterToken) {
      return 'multipart'
    }
    if (handler.adapterToken === StreamAdapterToken) {
      return 'stream'
    }
    return 'endpoint'
  }

  /**
   * Builds OpenAPI parameters from endpoint config
   */
  private buildParameters(config: BaseEndpointConfig): ParameterObject[] {
    const params: ParameterObject[] = []

    // URL parameters (from $paramName in URL)
    const urlParams = this.extractUrlParamNames(config.url)
    for (const param of urlParams) {
      params.push({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })
    }

    // Query parameters (from querySchema)
    if (config.querySchema) {
      const { schema: querySchema } = this.schemaConverter.convert(
        config.querySchema,
      )
      const schemaObj = querySchema as SchemaObject
      if (schemaObj.properties) {
        for (const [name, schema] of Object.entries(schemaObj.properties)) {
          params.push({
            name,
            in: 'query',
            required: schemaObj.required?.includes(name) ?? false,
            schema: schema as SchemaObject,
            description: (schema as SchemaObject).description,
          })
        }
      }
    }

    return params
  }

  /**
   * Builds request body based on endpoint type
   */
  private buildRequestBody(
    config: BaseEndpointConfig,
    handler: HandlerMetadata<any>,
  ): RequestBodyObject | undefined {
    const type = this.getEndpointType(handler)

    switch (type) {
      case 'multipart':
        return this.buildMultipartRequestBody(config)
      case 'stream':
        return undefined // Streams typically don't have request bodies
      case 'endpoint':
      default:
        return this.buildJsonRequestBody(config)
    }
  }

  /**
   * Builds request body for JSON endpoints
   */
  private buildJsonRequestBody(
    config: BaseEndpointConfig,
  ): RequestBodyObject | undefined {
    if (!config.requestSchema) {
      return undefined
    }

    const { schema } = this.schemaConverter.convert(config.requestSchema)

    return {
      required: true,
      content: {
        'application/json': {
          schema,
        },
      },
    }
  }

  /**
   * Builds request body for multipart endpoints
   */
  private buildMultipartRequestBody(
    config: BaseEndpointConfig,
  ): RequestBodyObject {
    if (!config.requestSchema) {
      return {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object' },
          },
        },
      }
    }

    const schema = this.schemaConverter.convert(config.requestSchema).schema as SchemaObject

    // Transform schema properties to handle File types
    const properties = this.schemaConverter.transformFileProperties(
      (schema.properties as Record<string, SchemaObject>) || {},
    )

    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties,
            required: schema.required,
          },
        },
      },
    }
  }

  /**
   * Builds responses based on endpoint type
   */
  private buildResponses(endpoint: DiscoveredEndpoint): ResponsesObject {
    const { config, handler } = endpoint
    const type = this.getEndpointType(handler)

    switch (type) {
      case 'stream':
        return this.buildStreamResponses(endpoint)
      case 'multipart':
      case 'endpoint':
      default:
        return this.buildJsonResponses(config, handler)
    }
  }

  /**
   * Builds responses for JSON endpoints
   */
  private buildJsonResponses(
    config: BaseEndpointConfig,
    handler: HandlerMetadata<any>,
  ): ResponsesObject {
    const successCode = handler.successStatusCode?.toString() ?? '200'

    if (!config.responseSchema) {
      return {
        [successCode]: {
          description: 'Successful response',
        },
      }
    }

    const { schema } = this.schemaConverter.convert(config.responseSchema)

    return {
      [successCode]: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema,
          },
        },
      },
    }
  }

  /**
   * Builds responses for stream endpoints
   */
  private buildStreamResponses(endpoint: DiscoveredEndpoint): ResponsesObject {
    const { openApiMetadata, handler } = endpoint
    const successCode = handler.successStatusCode?.toString() ?? '200'

    const contentType =
      openApiMetadata.stream?.contentType ?? 'application/octet-stream'
    const description =
      openApiMetadata.stream?.description ?? 'Stream response'

    const content: ContentObject = this.getStreamContent(contentType)

    return {
      [successCode]: {
        description,
        content,
      },
    }
  }

  /**
   * Gets content object for different stream types
   */
  private getStreamContent(contentType: string): ContentObject {
    switch (contentType) {
      case 'text/event-stream':
        return {
          'text/event-stream': {
            schema: {
              type: 'string',
              description: 'Server-Sent Events stream',
            },
          },
        }

      case 'application/octet-stream':
        return {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
              description: 'Binary file download',
            },
          },
        }

      case 'application/json':
        return {
          'application/json': {
            schema: {
              type: 'string',
              description: 'Newline-delimited JSON stream',
            },
          },
        }

      default:
        return {
          [contentType]: {
            schema: { type: 'string', format: 'binary' },
          },
        }
    }
  }
}
