import { AbstractHandlerAdapterService, type ArgumentGetter } from '@navios/core'

import type { HandlerMetadata, ZodBaseEndpointOptions } from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Abstract base class for Fastify handler adapters.
 *
 * Provides shared argument parsing logic for Fastify:
 * - Query parameters via request.query
 * - Request body via request.body
 * - URL parameters via request.params
 *
 * Concrete adapters (Endpoint, Stream) implement response handling
 * via createStaticHandler and createDynamicHandler.
 *
 * The schemas are handed to Fastify's Zod validator and serializer compilers,
 * so the endpoint configuration is constrained to Zod schemas.
 *
 * @typeParam TConfig - Endpoint configuration type
 */
export abstract class AbstractFastifyHandlerAdapterService<
  TConfig extends ZodBaseEndpointOptions = ZodBaseEndpointOptions,
> extends AbstractHandlerAdapterService<FastifyRequest, FastifyReply, TConfig> {
  /**
   * Creates argument getters for Fastify request parsing.
   *
   * Handles:
   * - Query params: Extracts from request.query (pre-validated by Fastify)
   * - Request body: Extracts from request.body (pre-validated by Fastify)
   * - URL params: Extracts route parameters from request.params
   */
  protected override createArgumentGetters(
    handlerMetadata: HandlerMetadata<TConfig>,
  ): ArgumentGetter<FastifyRequest>[] {
    const config = handlerMetadata.config
    const getters: ArgumentGetter<FastifyRequest>[] = []

    if (config.querySchema) {
      getters.push((target, request) => {
        target.params = request.query
      })
    }

    if (config.requestSchema) {
      getters.push((target, request) => {
        target.data = request.body
      })
    }

    if (this.hasUrlParams(config)) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }

    return getters
  }

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request, query, or error schemas.
   */
  override hasSchema(handlerMetadata: HandlerMetadata<TConfig>): boolean {
    const config = handlerMetadata.config
    return (
      !!config.requestSchema ||
      !!config.querySchema ||
      (this.options.validateResponses !== false && !!config.errorSchema)
    )
  }

  /**
   * Provides Fastify schema information for the handler.
   *
   * Creates a Fastify route schema object that includes request body and
   * query string schemas. This enables Fastify's built-in validation.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
  override provideSchema(handlerMetadata: HandlerMetadata<TConfig>): Record<string, any> {
    const schema: Record<string, any> = {}
    const { querySchema, requestSchema, errorSchema } = handlerMetadata.config

    if (querySchema) {
      schema.querystring = querySchema
    }
    if (requestSchema) {
      schema.body = requestSchema
    }
    if (this.options.validateResponses !== false && errorSchema) {
      schema.response = {
        ...errorSchema,
      }
    }

    return schema
  }
}
