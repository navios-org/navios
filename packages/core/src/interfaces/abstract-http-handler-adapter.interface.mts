import type { ClassType, RequestContextHolder } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'
import type { ExecutionContext } from '../services/index.mjs'

export interface AbstractHttpHandlerAdapterInterface {
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((target: Record<string, any>, request: any) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    executionContext: ExecutionContext,
    handlerMetadata: HandlerMetadata<any>,
  ) => (context: RequestContextHolder, request: any, reply: any) => Promise<any>
}
