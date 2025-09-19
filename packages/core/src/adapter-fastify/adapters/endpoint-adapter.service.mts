import type { BaseEndpointConfig } from '@navios/builder'
import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Injectable, InjectionToken } from '@navios/di'

import type { HandlerMetadata } from '../../metadata/index.mjs'

import { FastifyStreamAdapterService } from './stream-adapter.service.mjs'

export const FastifyEndpointAdapterToken =
  InjectionToken.create<FastifyEndpointAdapterService>(
    Symbol.for('FastifyEndpointAdapterService'),
  )

@Injectable({
  token: FastifyEndpointAdapterToken,
})
export class FastifyEndpointAdapterService extends FastifyStreamAdapterService {
  override hasSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): boolean {
    const config = handlerMetadata.config
    return super.hasSchema(handlerMetadata) || !!config.responseSchema
  }

  override provideSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Record<string, any> {
    const config = handlerMetadata.config
    const schema = super.provideSchema(handlerMetadata)
    if (config.responseSchema) {
      schema.response = {
        200: config.responseSchema,
      }
    }

    return schema
  }

  override provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): (
    context: RequestContextHolder,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<any> {
    const getters = this.prepareArguments(handlerMetadata)
    const formatArguments = async (request: FastifyRequest) => {
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

    return async (
      context: RequestContextHolder,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const controllerInstance = await this.container.get(controller)
      const argument = await formatArguments(request)
      const result =
        await controllerInstance[handlerMetadata.classMethod](argument)
      reply
        .status(handlerMetadata.successStatusCode)
        .headers(handlerMetadata.headers)
        .send(result)
    }
  }
}
