import type { BaseEndpointConfig } from '@navios/builder'
import type { ClassType, RequestContextHolder } from '@navios/di'
import type { BunRequest } from 'bun'

import { Injectable, InjectionToken } from '@navios/di'

import type { HandlerMetadata } from '../../index.mjs'

import { BunStreamAdapterService } from './stream-adapter.service.mjs'

export const BunEndpointAdapterToken =
  InjectionToken.create<BunEndpointAdapterService>(
    Symbol.for('BunEndpointAdapterService'),
  )

@Injectable({
  token: BunEndpointAdapterToken,
})
export class BunEndpointAdapterService extends BunStreamAdapterService {
  override hasSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): boolean {
    const config = handlerMetadata.config
    return super.hasSchema(handlerMetadata) || !!config.responseSchema
  }

  override provideSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Record<string, any> {
    // For Bun, no schema
    return {}
  }

  override provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
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
    const responseSchema = handlerMetadata.config.responseSchema
    const formatResponse = responseSchema
      ? (result: any) => {
          return responseSchema.parse(result)
        }
      : (result: any) => result

    return async (context: RequestContextHolder, request: BunRequest) => {
      const controllerInstance = await this.container.get(controller)
      const argument = await formatArguments(request)
      const result =
        await controllerInstance[handlerMetadata.classMethod](argument)
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(handlerMetadata.headers)) {
        headers[key] = String(value)
      }
      return new Response(JSON.stringify(formatResponse(result)), {
        status: handlerMetadata.successStatusCode,
        headers: { 'Content-Type': 'application/json', ...headers },
      })
    }
  }
}
