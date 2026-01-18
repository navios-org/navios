import { Injectable, InjectionToken } from '@navios/core'

import type { EndpointOptions } from '@navios/builder'
import type {
  AbstractDynamicHandler,
  AbstractStaticHandler,
  FormatArgumentsFn,
  HandlerContext,
  HandlerMetadata,
  InstanceResolution,
} from '@navios/core'
import type { BunRequest } from 'bun'

import { AbstractBunHandlerAdapterService } from './abstract-bun-handler-adapter.service.mjs'

/**
 * Injection token for the Bun endpoint adapter service.
 *
 * This token is used to inject the `BunEndpointAdapterService` instance
 * into the dependency injection container.
 */
export const BunEndpointAdapterToken = InjectionToken.create<BunEndpointAdapterService>(
  Symbol.for('BunEndpointAdapterService'),
)

/**
 * Adapter service for handling standard REST endpoint requests in Bun.
 *
 * This service extends `AbstractBunHandlerAdapterService` and provides specialized
 * handling for REST endpoints with request/response schema validation.
 * It automatically parses request bodies, query parameters, and URL parameters,
 * validates them against Zod schemas, and formats responses according to
 * response schemas.
 *
 * @extends {AbstractBunHandlerAdapterService<EndpointOptions>}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Endpoint()
 * @Controller()
 * class UserController {
 *   @Endpoint({
 *     method: 'POST',
 *     url: '/users',
 *     requestSchema: createUserSchema,
 *     responseSchema: userSchema,
 *   })
 *   async createUser(data: CreateUserDto) {
 *     // data is validated against createUserSchema
 *     return { id: 1, ...data } // Response validated against userSchema
 *   }
 * }
 * ```
 */
@Injectable({
  token: BunEndpointAdapterToken,
})
export class BunEndpointAdapterService extends AbstractBunHandlerAdapterService<EndpointOptions> {
  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request, query, or response schemas.
   */
  override hasSchema(handlerMetadata: HandlerMetadata<EndpointOptions>): boolean {
    const config = handlerMetadata.config
    return (
      super.hasSchema(handlerMetadata) ||
      (!!this.options.validateResponses && !!config.responseSchema)
    )
  }

  /**
   * Provides schema information for the handler.
   *
   * For Bun adapter, this returns an empty object as Bun doesn't require
   * schema registration like some other frameworks.
   *
   * @param _handlerMetadata - The handler metadata containing configuration.
   * @returns An empty schema object.
   */
  override provideSchema(_handlerMetadata: HandlerMetadata<EndpointOptions>): Record<string, any> {
    return {}
  }

  /**
   * Builds response headers with Content-Type: application/json.
   */
  protected override buildHeaders(
    context: HandlerContext<EndpointOptions>,
  ): Record<string, string> {
    const headers = super.buildHeaders(context)
    headers['Content-Type'] = 'application/json'
    return headers
  }

  /**
   * Creates a static handler for singleton controllers.
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected override createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<BunRequest>,
    context: HandlerContext<EndpointOptions>,
  ): AbstractStaticHandler<BunRequest, void> {
    const headers = this.buildHeaders(context)
    const formatResponse = this.buildResponseFormatter(context)
    const { statusCode } = context

    return {
      isStatic: true,
      handler: this.wrapWithErrorHandling(async (request: BunRequest) => {
        const argument = await formatArguments(request)
        const result = await boundMethod(argument)
        return new Response(JSON.stringify(formatResponse(result)), {
          status: statusCode,
          headers,
        })
      }),
    }
  }

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected override createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<BunRequest>,
    context: HandlerContext<EndpointOptions>,
  ): AbstractDynamicHandler<BunRequest, void> {
    const headers = this.buildHeaders(context)
    const formatResponse = this.buildResponseFormatter(context)
    const { statusCode, methodName } = context

    return {
      isStatic: false,
      handler: this.wrapWithErrorHandling(async (scoped, request: BunRequest) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const argument = await formatArguments(request)
        const result = await controllerInstance[methodName](argument)
        return new Response(JSON.stringify(formatResponse(result)), {
          status: statusCode,
          headers,
        })
      }),
    }
  }

  /**
   * Builds a response formatter with optional schema validation.
   */
  protected buildResponseFormatter(context: HandlerContext<EndpointOptions>) {
    const responseSchema = context.handlerMetadata.config.responseSchema
    const shouldValidate = this.options.validateResponses !== false

    return responseSchema && shouldValidate
      ? (result: any) => responseSchema.parse(result)
      : (result: any) => result
  }
}
