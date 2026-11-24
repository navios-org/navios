import {
  AbstractHandlerAdapterService,
  type ArgumentGetter,
  type HandlerContext,
} from '@navios/core'

import type { HandlerMetadata, ZodBaseEndpointOptions } from '@navios/core'
import type { BunRequest } from 'bun'

/**
 * Abstract base class for Bun handler adapters.
 *
 * Provides shared argument parsing logic for Bun:
 * - Query parameters via URL parsing
 * - Request body via request.json()
 * - URL parameters via request.params
 *
 * Concrete adapters (Endpoint, Stream) implement response handling
 * via createStaticHandler and createDynamicHandler.
 *
 * Query and body are validated with the schemas' Zod `parse`, so the endpoint
 * configuration is constrained to Zod schemas.
 *
 * @typeParam TConfig - Endpoint configuration type
 */
export abstract class AbstractBunHandlerAdapterService<
  TConfig extends ZodBaseEndpointOptions = ZodBaseEndpointOptions,
> extends AbstractHandlerAdapterService<BunRequest, void, TConfig> {
  /**
   * Creates argument getters for Bun request parsing.
   *
   * Handles:
   * - Query params: Parses URL search params with schema validation
   * - Request body: Parses JSON body with schema validation
   * - URL params: Extracts route parameters from request.params
   */
  protected override createArgumentGetters(
    handlerMetadata: HandlerMetadata<TConfig>,
  ): ArgumentGetter<BunRequest>[] {
    const config = handlerMetadata.config
    const getters: ArgumentGetter<BunRequest>[] = []

    if (config.querySchema) {
      const schema = config.querySchema
      getters.push((target, request) => {
        const url = new URL(request.url)
        target.params = schema.parse(Object.fromEntries(url.searchParams))
      })
    }

    if (config.requestSchema) {
      const schema = config.requestSchema
      getters.push(async (target, request) => {
        target.data = schema.parse(await request.json())
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
   * Builds response headers from context.
   * Can be overridden by concrete adapters to add Content-Type, etc.
   */
  protected buildHeaders(context: HandlerContext<TConfig>): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(context.headers)) {
      headers[key] = String(value)
    }
    return headers
  }
}
