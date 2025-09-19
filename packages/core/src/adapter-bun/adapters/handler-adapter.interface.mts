import type { ClassType, RequestContextHolder } from '@navios/di'
import type { BunRequest } from 'bun'

import type {
  AbstractHttpHandlerAdapterInterface,
  HandlerMetadata,
} from '../../index.mjs'

export interface BunHandlerAdapterInterface
  extends AbstractHttpHandlerAdapterInterface {
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((
    target: Record<string, any>,
    request: BunRequest,
  ) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => (context: RequestContextHolder, request: BunRequest) => Promise<Response>
}
