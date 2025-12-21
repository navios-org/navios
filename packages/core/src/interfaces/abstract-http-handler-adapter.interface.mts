import type { ClassType, ScopedContainer } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'

/**
 * Static handler result - handler can be called without a scoped container.
 * Used when the controller and all its dependencies are singletons.
 */
export type StaticHandler<TRequest = any, TReply = any> = {
  isStatic: true
  handler: (request: TRequest, reply: TReply) => Promise<any>
}

/**
 * Dynamic handler result - handler requires a scoped container for resolution.
 * Used when the controller or its dependencies need per-request resolution.
 */
export type DynamicHandler<TRequest = any, TReply = any> = {
  isStatic: false
  handler: (
    scoped: ScopedContainer,
    request: TRequest,
    reply: TReply,
  ) => Promise<any>
}

/**
 * Handler result returned by provideHandler.
 * Can be either static (pre-resolved) or dynamic (needs scoped container).
 */
export type HandlerResult<TRequest = any, TReply = any> =
  | StaticHandler<TRequest, TReply>
  | DynamicHandler<TRequest, TReply>

export interface AbstractHttpHandlerAdapterInterface {
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((target: Record<string, any>, request: any) => Promise<void> | void)[]
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => Promise<HandlerResult>
}
