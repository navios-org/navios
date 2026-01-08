import type { BaseEndpointOptions } from '@navios/builder'
import type {
  AbstractDynamicHandler,
  AbstractStaticHandler,
  FormatArgumentsFn,
  HandlerContext,
  InstanceResolution,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Injectable, InjectionToken } from '@navios/core'

import { AbstractFastifyHandlerAdapterService } from './abstract-fastify-handler-adapter.service.mjs'

/**
 * Injection token for the Fastify stream adapter service.
 *
 * This token is used to inject the `FastifyStreamAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyStreamAdapterToken =
  InjectionToken.create<FastifyStreamAdapterService>(
    Symbol.for('FastifyStreamAdapterService'),
  )

/**
 * Adapter service for handling streaming requests and responses in Fastify.
 *
 * This service extends `AbstractFastifyHandlerAdapterService` and provides
 * handling for stream-based endpoints. Handlers receive the Fastify reply
 * object for direct control over the response stream.
 *
 * @extends {AbstractFastifyHandlerAdapterService<BaseEndpointOptions>}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Stream()
 * @Controller()
 * class StreamController {
 *   @Stream(streamEvents)
 *   async streamData(data: StreamDto, reply: FastifyReply) {
 *     reply.type('text/event-stream')
 *     // Use reply object to stream data
 *     reply.send(stream)
 *   }
 * }
 * ```
 */
@Injectable({
  token: FastifyStreamAdapterToken,
})
export class FastifyStreamAdapterService extends AbstractFastifyHandlerAdapterService<BaseEndpointOptions> {
  /**
   * Creates a static handler for singleton controllers.
   *
   * Passes the Fastify reply object as the second argument to the controller method
   * for direct stream control.
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected override createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<BaseEndpointOptions>,
  ): AbstractStaticHandler<FastifyRequest, FastifyReply> {
    if (context.hasArguments) {
      return {
        isStatic: true,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          const argument = await formatArguments(request)
          await boundMethod(argument, reply)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: true,
      handler: async (_request: FastifyRequest, reply: FastifyReply) => {
        await boundMethod(emptyArgs, reply)
      },
    }
  }

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * Passes the Fastify reply object as the second argument to the controller method
   * for direct stream control.
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected override createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<BaseEndpointOptions>,
  ): AbstractDynamicHandler<FastifyRequest, FastifyReply> {
    const { methodName, hasArguments } = context

    if (hasArguments) {
      return {
        isStatic: false,
        handler: async (
          scoped,
          request: FastifyRequest,
          reply: FastifyReply,
        ) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          await controllerInstance[methodName](argument, reply)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: false,
      handler: async (
        scoped,
        _request: FastifyRequest,
        reply: FastifyReply,
      ) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        await controllerInstance[methodName](emptyArgs, reply)
      },
    }
  }
}
