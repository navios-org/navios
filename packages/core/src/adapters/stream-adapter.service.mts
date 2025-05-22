import type { BaseStreamConfig } from '@navios/builder'
import type { ClassType } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { inject, Injectable, InjectionToken } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'
import type { ExecutionContext } from '../services/index.mjs'
import type { HandlerAdapterInterface } from './handler-adapter.interface.mjs'

export const StreamAdapterToken = InjectionToken.create<StreamAdapterService>(
  Symbol.for('StreamAdapterService'),
)

@Injectable({
  token: StreamAdapterToken,
})
export class StreamAdapterService implements HandlerAdapterInterface {
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

    return async function (request: FastifyRequest, reply: FastifyReply) {
      const controllerInstance = await inject(controller)
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
