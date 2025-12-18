import type { BaseEndpointConfig } from '@navios/builder'
import type { ClassType, HandlerMetadata, ScopedContainer } from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Injectable, InjectionToken } from '@navios/core'

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
    context: ScopedContainer,
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
    const responseSchema = handlerMetadata.config.responseSchema
    const formatResponse = responseSchema
      ? (result: any) => {
          return responseSchema.parse(result)
        }
      : (result: any) => result

    return async (
      context: ScopedContainer,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const controllerInstance = await context.get(controller)
      const argument = await formatArguments(request)
      const result =
        await controllerInstance[handlerMetadata.classMethod](argument)
      reply
        .status(handlerMetadata.successStatusCode)
        .headers(handlerMetadata.headers)
        .send(formatResponse(result))
    }
  }
}
