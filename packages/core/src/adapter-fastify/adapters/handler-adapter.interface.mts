import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type {
  AbstractHttpHandlerAdapterInterface,
  HandlerMetadata,
} from '../../index.mjs'

export interface FastifyHandlerAdapterInterface
  extends AbstractHttpHandlerAdapterInterface {
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
    handlerMetadata: HandlerMetadata<any>,
  ) => (
    context: RequestContextHolder,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<any>
}
