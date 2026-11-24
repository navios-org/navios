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
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ZodType } from 'zod/v4'

import { FastifyStreamAdapterService } from './stream-adapter.service.mjs'

/**
 * Injection token for the Fastify endpoint adapter service.
 *
 * This token is used to inject the `FastifyEndpointAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyEndpointAdapterToken = InjectionToken.create<FastifyEndpointAdapterService>(
  Symbol.for('FastifyEndpointAdapterService'),
)

/**
 * Adapter service for handling standard REST endpoint requests in Fastify.
 *
 * This service extends `FastifyStreamAdapterService` and provides specialized
 * handling for REST endpoints with request/response schema validation.
 * It automatically parses request bodies, query parameters, and URL parameters,
 * validates them against Zod schemas, and formats responses according to
 * response schemas using Fastify's schema system.
 *
 * An endpoint declared with `response: 'void'` is answered without a body and
 * without response validation; its status is 204 unless `@HttpCode` set another.
 *
 * An endpoint declared with a per-status `responses` map answers with the
 * status and body its method picked with `reply(status, body)`. The body is
 * validated with the schema of that status (when `validateResponses` is on),
 * and a status declared as `null` is sent without a body. Returning anything
 * but a `reply` for a declared status is a server error (500).
 *
 * @extends {FastifyStreamAdapterService}
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
  token: FastifyEndpointAdapterToken,
})
export class FastifyEndpointAdapterService extends FastifyStreamAdapterService {
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
      (this.options.validateResponses !== false && Object.keys(successSchemas(config)).length > 0)
    )
  }

  /**
   * Provides Fastify schema information for the handler.
   *
   * Creates a Fastify route schema object that includes request body, query string,
   * and response schemas. This enables Fastify's built-in validation and serialization.
   *
   * The success schemas are `responseSchema` under 200, or every schema of a
   * per-status `responses` map under its own status.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
  override provideSchema(
    handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  ): Record<string, any> {
    const config = handlerMetadata.config
    const schema = super.provideSchema(handlerMetadata)
    const success = successSchemas(config)
    if (this.options.validateResponses !== false && Object.keys(success).length > 0) {
      schema.response = {
        ...config.errorSchema,
        ...success,
      }
    }

    return schema
  }

  /**
   * Creates a static handler for singleton controllers.
   *
   * Invokes the controller method and sends the response with proper status and headers.
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected override createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): AbstractStaticHandler<FastifyRequest, FastifyReply> {
    const { hasArguments } = context
    const send = this.buildSender(context)

    if (hasArguments) {
      return {
        isStatic: true,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          const argument = await formatArguments(request)
          const result = await boundMethod(argument)
          send(reply, result)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: true,
      handler: async (_request: FastifyRequest, reply: FastifyReply) => {
        const result = await boundMethod(emptyArgs)
        send(reply, result)
      },
    }
  }

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * Resolves the controller per-request and sends the response with proper status and headers.
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected override createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): AbstractDynamicHandler<FastifyRequest, FastifyReply> {
    const { methodName, hasArguments } = context
    const send = this.buildSender(context)

    if (hasArguments) {
      return {
        isStatic: false,
        handler: async (scoped, request: FastifyRequest, reply: FastifyReply) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          const result = await controllerInstance[methodName](argument)
          send(reply, result)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: false,
      handler: async (scoped, _request: FastifyRequest, reply: FastifyReply) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const result = await controllerInstance[methodName](emptyArgs)
        send(reply, result)
      },
    }
  }

  /**
   * Builds the function that writes the controller's result to the reply.
   *
   * For a `response: 'void'` endpoint the result is discarded and the reply
   * has no body. For an endpoint with a `responses` map the result must be a
   * `reply(status, body)` for a declared status; anything else throws, which
   * Fastify's error handler answers with 500.
   */
  protected buildSender(
    context: HandlerContext<ZodBaseEndpointOptions>,
  ): (reply: FastifyReply, result: unknown) => void {
    const { statusCode, headers } = context
    const config = context.handlerMetadata.config

    if (isVoidResponse(config)) {
      return (reply) => {
        reply.status(statusCode).headers(headers).send()
      }
    }
    if (config.responses) {
      // The status comes from reply(); `statusCode` (and @HttpCode) do not apply.
      return (reply, result) => {
        const { status, schema, body } = resolveEndpointReply(config, result)
        if (schema === null) {
          reply.status(status).headers(headers).send()
        } else {
          reply.status(status).headers(headers).send(body)
        }
      }
    }
    return (reply, result) => {
      reply.status(statusCode).headers(headers).send(result)
    }
  }
}

function isVoidResponse(config: ZodBaseEndpointOptions): boolean {
  return config.response === 'void'
}

/**
 * The schemas successful replies are validated and serialized with, by status.
 * A void endpoint sends no body, so it has none; neither has a `null` entry
 * of a `responses` map.
 */
function successSchemas(config: ZodBaseEndpointOptions): Record<number, ZodType> {
  if (isVoidResponse(config)) {
    return {}
  }
  if (config.responses) {
    const schemas: Record<number, ZodType> = {}
    for (const [status, schema] of Object.entries(config.responses)) {
      if (schema !== null) {
        schemas[Number(status)] = schema
      }
    }
    return schemas
  }
  return config.responseSchema ? { 200: config.responseSchema } : {}
}
