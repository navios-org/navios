import type { BaseEndpointConfig } from '@navios/common'
import type { ClassType } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { inject, Injectable, InjectionToken } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'
import type { ExecutionContext } from '../services/index.mjs'

import { StreamAdapterService } from './stream-adapter.service.mjs'

export const EndpointAdapterToken =
  InjectionToken.create<EndpointAdapterService>(
    Symbol.for('EndpointAdapterService'),
  )

@Injectable({
  token: EndpointAdapterToken,
})
export class EndpointAdapterService extends StreamAdapterService {
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
    executionContext: ExecutionContext,
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<any> {
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

    return async function (request, reply) {
      const controllerInstance = await inject(controller)
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
