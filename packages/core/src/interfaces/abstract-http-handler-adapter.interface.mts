import type { ClassType, RequestContextHolder } from '@navios/di'

import type { AbstractExecutionContext } from '../interfaces/index.mjs'
import type { HandlerMetadata } from '../metadata/index.mjs'

export interface AbstractHttpHandlerAdapterInterface {
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((target: Record<string, any>, request: any) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    executionContext: AbstractExecutionContext,
    handlerMetadata: HandlerMetadata<any>,
  ) => (context: RequestContextHolder, request: any, reply: any) => Promise<any>
}
