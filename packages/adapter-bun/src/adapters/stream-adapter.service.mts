import type { BaseEndpointOptions } from '@navios/builder'
import type {
  AbstractDynamicHandler,
  AbstractStaticHandler,
  FormatArgumentsFn,
  HandlerContext,
  InstanceResolution,
} from '@navios/core'
import type { BunRequest } from 'bun'

import { Injectable, InjectionToken } from '@navios/core'

import { AbstractBunHandlerAdapterService } from './abstract-bun-handler-adapter.service.mjs'

/**
 * Injection token for the Bun stream adapter service.
 *
 * This token is used to inject the `BunStreamAdapterService` instance
 * into the dependency injection container.
 */
export const BunStreamAdapterToken =
  InjectionToken.create<BunStreamAdapterService>(
    Symbol.for('BunStreamAdapterService'),
  )

/**
 * Adapter service for handling streaming requests and responses in Bun.
 *
 * This service extends `AbstractBunHandlerAdapterService` and provides
 * handling for stream-based endpoints. Handlers receive a streamWriter
 * stub and can return Response objects directly for streaming.
 *
 * @extends {AbstractBunHandlerAdapterService<BaseEndpointOptions>}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Stream()
 * @Controller()
 * class StreamController {
 *   @Stream(streamEvents)
 *   async streamData(data: StreamDto) {
 *     // Returns a Response object for streaming
 *     return new Response(stream, {
 *       headers: { 'Content-Type': 'text/event-stream' },
 *     })
 *   }
 * }
 * ```
 */
@Injectable({
  token: BunStreamAdapterToken,
})
export class BunStreamAdapterService extends AbstractBunHandlerAdapterService<BaseEndpointOptions> {
  /**
   * Creates a static handler for singleton controllers.
   *
   * Passes a streamWriter stub as the second argument to the controller method.
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected override createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<BunRequest>,
    context: HandlerContext<BaseEndpointOptions>,
  ): AbstractStaticHandler<BunRequest, void> {
    const headersTemplate = this.buildHeaders(context)
    const handleStreamResult = this.createStreamResultHandler(
      context,
      headersTemplate,
    )
    const streamWriter = this.createStreamWriter()

    return {
      isStatic: true,
      handler: this.wrapWithErrorHandling(async (request: BunRequest) => {
        const argument = await formatArguments(request)
        const result = await boundMethod(argument, streamWriter)
        return handleStreamResult(result)
      }),
    }
  }

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * Passes a streamWriter stub as the second argument to the controller method.
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected override createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<BunRequest>,
    context: HandlerContext<BaseEndpointOptions>,
  ): AbstractDynamicHandler<BunRequest, void> {
    const headersTemplate = this.buildHeaders(context)
    const handleStreamResult = this.createStreamResultHandler(
      context,
      headersTemplate,
    )
    const streamWriter = this.createStreamWriter()
    const { methodName } = context

    return {
      isStatic: false,
      handler: this.wrapWithErrorHandling(
        async (scoped, request: BunRequest) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          const result = await controllerInstance[methodName](
            argument,
            streamWriter,
          )
          return handleStreamResult(result)
        },
      ),
    }
  }

  /**
   * Creates a stream writer stub for Bun.
   */
  protected createStreamWriter() {
    return {
      write: (_data: any) => {},
      end: () => {},
    }
  }

  /**
   * Creates a handler for stream results.
   *
   * If the result is a Response, adds custom headers.
   * Otherwise, wraps the result in a new Response.
   */
  protected createStreamResultHandler(
    context: HandlerContext<BaseEndpointOptions>,
    headersTemplate: Record<string, string>,
  ) {
    return (result: any) => {
      if (result instanceof Response) {
        for (const [key, value] of Object.entries(headersTemplate)) {
          result.headers.set(key, value)
        }
        return result
      }
      return new Response(result, {
        status: context.statusCode,
        headers: headersTemplate,
      })
    }
  }
}
