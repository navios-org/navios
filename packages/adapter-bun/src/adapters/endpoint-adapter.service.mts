import { Injectable, InjectionToken, resolveEndpointReply } from '@navios/core'

import type {
  AbstractDynamicHandler,
  AbstractStaticHandler,
  FormatArgumentsFn,
  HandlerContext,
  HandlerMetadata,
  InstanceResolution,
  ZodBaseEndpointOptions,
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
 * An endpoint declared with `response: 'void'` is answered without a body and
 * without response validation; its status is 204 unless `@HttpCode` set another.
 *
 * An endpoint declared with a per-status `responses` map answers with the
 * status and body its method picked with `reply(status, body)`. The body is
 * validated with the schema of that status (unless `validateResponses` is
 * off), and a status declared as `null` is sent without a body. Returning
 * anything but a `reply` for a declared status is a server error (500).
 *
 * @extends {AbstractBunHandlerAdapterService<ZodBaseEndpointOptions>}
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
export class BunEndpointAdapterService extends AbstractBunHandlerAdapterService<ZodBaseEndpointOptions> {
  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request, query, or response schemas.
   */
  override hasSchema(handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>): boolean {
    const config = handlerMetadata.config
    return (
      super.hasSchema(handlerMetadata) ||
      (!!this.options.validateResponses &&
        !isVoidResponse(config) &&
        (config.responses
          ? Object.values(config.responses).some((schema) => schema !== null)
          : !!config.responseSchema))
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
  override provideSchema(
    _handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  ): Record<string, any> {
    return {}
  }

  /**
   * Builds response headers with Content-Type: application/json.
   * A `response: 'void'` endpoint has no body and therefore no Content-Type.
   */
  protected override buildHeaders(
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): Record<string, string> {
    const headers = super.buildHeaders(context)
    if (!isVoidResponse(context.handlerMetadata.config)) {
      headers['Content-Type'] = 'application/json'
    }
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
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): AbstractStaticHandler<BunRequest, void> {
    const respond = this.buildResponder(context)

    return {
      isStatic: true,
      handler: this.wrapWithErrorHandling(async (request: BunRequest) => {
        const argument = await formatArguments(request)
        const result = await boundMethod(argument)
        return respond(result)
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
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): AbstractDynamicHandler<BunRequest, void> {
    const respond = this.buildResponder(context)
    const { methodName } = context

    return {
      isStatic: false,
      handler: this.wrapWithErrorHandling(async (scoped, request: BunRequest) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const argument = await formatArguments(request)
        const result = await controllerInstance[methodName](argument)
        return respond(result)
      }),
    }
  }

  /**
   * Builds the function that turns the controller's result into a Response.
   *
   * For a `response: 'void'` endpoint the result is discarded: the reply has
   * no body and nothing is validated. For an endpoint with a `responses` map
   * the result must be a `reply(status, body)` for a declared status; anything
   * else throws, which the adapter's error handling answers with 500.
   */
  protected buildResponder(
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): (result: unknown) => Response {
    const headers = this.buildHeaders(context)
    const { statusCode } = context
    const config = context.handlerMetadata.config

    if (isVoidResponse(config)) {
      return () => new Response(null, { status: statusCode, headers })
    }

    if (config.responses) {
      // The status comes from reply(); `statusCode` (and @HttpCode) do not apply.
      const shouldValidate = this.options.validateResponses !== false
      // A status without a body has no Content-Type either.
      const { 'Content-Type': _contentType, ...bodilessHeaders } = headers
      return (result) => {
        const { status, schema, body } = resolveEndpointReply(config, result)
        if (schema === null) {
          return new Response(null, { status, headers: bodilessHeaders })
        }
        const payload = shouldValidate ? parseResponseBody(schema, body, config) : body
        return new Response(JSON.stringify(payload), { status, headers })
      }
    }

    const formatResponse = this.buildResponseFormatter(context)
    return (result) =>
      new Response(JSON.stringify(formatResponse(result)), { status: statusCode, headers })
  }

  /**
   * Builds a response formatter with optional schema validation.
   */
  protected buildResponseFormatter(context: HandlerContext<ZodBaseEndpointOptions>) {
    const responseSchema = context.handlerMetadata.config.responseSchema
    const shouldValidate = this.options.validateResponses !== false

    const config = context.handlerMetadata.config
    return responseSchema && shouldValidate
      ? (result: any) => parseResponseBody(responseSchema, result, config)
      : (result: any) => result
  }
}

function isVoidResponse(config: ZodBaseEndpointOptions): boolean {
  return config.response === 'void'
}

/**
 * Validates what a handler returned against its response schema.
 *
 * A mismatch is a bug in the server, not in the request, so it must not be
 * reported as a 400 validation error the way request failures are. The
 * `ZodError` is wrapped in a plain `Error` (kept as `cause`), which the
 * controller adapter answers with a 500.
 */
function parseResponseBody(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown } },
  body: unknown,
  config: ZodBaseEndpointOptions,
): unknown {
  const parsed = schema.safeParse(body)
  if (parsed.success) {
    return parsed.data
  }
  throw new Error(
    `[Navios] ${config.method} ${config.url} returned a response that does not match its schema.`,
    { cause: parsed.error },
  )
}
