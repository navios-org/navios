import type { ClassType, RequestContextHolder } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'

export interface AbstractHttpHandlerAdapterInterface {
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((target: Record<string, any>, request: any) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => (context: RequestContextHolder, request: any, reply: any) => Promise<any>
}
