import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { HandlerMetadata } from '../metadata/index.mjs'
import type { ExecutionContext } from '../services/index.mjs'

export interface HandlerAdapterInterface {
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((
    target: Record<string, any>,
    request: FastifyRequest,
  ) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    executionContext: ExecutionContext,
    handlerMetadata: HandlerMetadata<any>,
  ) => (
    context: RequestContextHolder,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<any>
}
