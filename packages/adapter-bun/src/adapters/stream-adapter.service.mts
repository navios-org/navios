import type { BaseStreamConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'
import type { ClassType, RequestContextHolder } from '@navios/di'
import type { BunRequest } from 'bun'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type { BunHandlerAdapterInterface } from './handler-adapter.interface.mjs'

export const BunStreamAdapterToken =
  InjectionToken.create<BunStreamAdapterService>(
    Symbol.for('BunStreamAdapterService'),
  )

@Injectable({
  token: BunStreamAdapterToken,
})
export class BunStreamAdapterService implements BunHandlerAdapterInterface {
  protected container = inject(Container)

  hasSchema(handlerMetadata: HandlerMetadata<BaseStreamConfig>): boolean {
    const config = handlerMetadata.config
    return !!config.requestSchema || !!config.querySchema
  }

  prepareArguments(handlerMetadata: HandlerMetadata<BaseStreamConfig>) {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: BunRequest,
    ) => void | Promise<void>)[] = []
    if (config.querySchema) {
      const schema = config.querySchema
      getters.push((target, request) => {
        const url = new URL(request.url)
        // @ts-expect-error - schema is unknown type
        target.params = schema.parse(Object.fromEntries(url.searchParams))
      })
    }
    if (config.requestSchema) {
      const schema = config.requestSchema
      getters.push(async (target, request) => {
        // @ts-expect-error - schema is unknown type
        target.data = schema.parse(await request.json())
      })
    }
    getters.push((target, request) => {
      target.urlParams = request.params
    })

    return getters
  }

  provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): (context: RequestContextHolder, request: BunRequest) => Promise<Response> {
    const getters = this.prepareArguments(handlerMetadata)
    const formatArguments = async (request: BunRequest) => {
      const argument: Record<string, any> = {}
      const promises: Promise<void>[] = []
      for (const getter of getters) {
        const res = getter(argument, request)
        if (res instanceof Promise) {
          promises.push(res)
        }
      }
      await Promise.all(promises)
      return argument
    }

    return async (context: RequestContextHolder, request: BunRequest) => {
      const controllerInstance = await this.container.get(controller)
      const argument = await formatArguments(request)

      // For stream, assume the handler returns a Response
      const result = await controllerInstance[handlerMetadata.classMethod](
        argument,
        {
          // Mock reply for stream
          write: (_data: any) => {
            // For Bun, perhaps accumulate or use Response with stream
            // But for simplicity, ignore stream for now
          },
          end: () => {},
        },
      )
      if (result instanceof Response) {
        for (const [key, value] of Object.entries(handlerMetadata.headers)) {
          result.headers.set(key, String(value))
        }
        return result
      }

      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(handlerMetadata.headers)) {
        headers[key] = String(value)
      }
      return new Response(result, {
        status: handlerMetadata.successStatusCode,
        headers,
      })
    }
  }

  provideSchema(
    _handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): Record<string, any> {
    // For Bun, no schema, return empty
    return {}
  }
}
