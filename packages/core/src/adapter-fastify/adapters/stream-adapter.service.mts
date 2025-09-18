import type { BaseStreamConfig } from '@navios/builder'
import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type { ExecutionContext, HandlerMetadata } from '../../index.mjs'
import type { FastifyHandlerAdapterInterface } from './handler-adapter.interface.mjs'

export const FastifyStreamAdapterToken =
  InjectionToken.create<FastifyStreamAdapterService>(
    Symbol.for('FastifyStreamAdapterService'),
  )

@Injectable({
  token: FastifyStreamAdapterToken,
})
export class FastifyStreamAdapterService
  implements FastifyHandlerAdapterInterface
{
  protected container = inject(Container)

  hasSchema(handlerMetadata: HandlerMetadata<BaseStreamConfig>): boolean {
    const config = handlerMetadata.config
    return !!config.requestSchema || !!config.querySchema
  }

  prepareArguments(handlerMetadata: HandlerMetadata<BaseStreamConfig>) {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: FastifyRequest,
    ) => void | Promise<void>)[] = []
    if (config.querySchema) {
      getters.push((target, request) => {
        target.params = request.query
      })
    }
    if (config.requestSchema) {
      getters.push((target, request) => {
        target.data = request.body
      })
    }
    if (config.url.includes('$')) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }

    return getters
  }

  provideHandler(
    controller: ClassType,
    executionContext: ExecutionContext,
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
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

      await controllerInstance[handlerMetadata.classMethod](argument, reply)
    }
  }

  provideSchema(
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): Record<string, any> {
    const schema: Record<string, any> = {}
    const { querySchema, requestSchema } = handlerMetadata.config

    if (querySchema) {
      schema.querystring = querySchema
    }
    if (requestSchema) {
      schema.body = requestSchema
    }

    return schema
  }
}
