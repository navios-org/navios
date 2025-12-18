import type {
  AbstractHttpHandlerAdapterInterface,
  ClassType,
  HandlerMetadata,
  ScopedContainer,
} from '@navios/core'
import type { BunRequest } from 'bun'

export interface BunHandlerAdapterInterface extends AbstractHttpHandlerAdapterInterface {
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
  ) => (context: ScopedContainer, request: BunRequest) => Promise<Response>
}
