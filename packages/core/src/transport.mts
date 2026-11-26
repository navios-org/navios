/**
 * What the author of a transport needs and application code does not: the
 * transport contract, the module graph, handler metadata, and the pieces of
 * an execution context.
 *
 * Application code imports from `@navios/core`.
 */
import './internal/this-copy.mjs'

// The contract, and what its types mention.
export { defineTransport } from './transports/transport.mjs'
export type {
  Transport,
  TransportDefinition,
  TransportFactory,
  TransportHost,
  TransportInstance,
} from './transports/transport.mjs'
export type { ClassType } from '@navios/di'
export type { LoggerService } from './logger/logger-output.mjs'

// Waiting, but not for ever.
export { MAX_DELAY_MS, settledWithin } from './transports/settled-within.mjs'

// The container: every object it has built, dependencies before dependents.
export { constructedInstances } from '@navios/di/internal'

// Modules.
export { buildModuleGraph } from './modules/module-graph.mjs'
export type { ModuleNode } from './modules/module-graph.mjs'
export { getModuleMetadata, hasModuleMetadata } from './modules/module-metadata.mjs'
export type { ModuleMetadata } from './modules/module-metadata.mjs'

// Handlers: what decorators attached to them, and what runs around them.
export { describeHandlerClass } from './metadata/handler-class.mjs'
export type { HandlerClassMetadata, HandlerClassOptions } from './metadata/handler-class.mjs'
export { memberMetadata } from './metadata/member-metadata.mjs'
export type { HandlerExtras, MethodHandlerMetadata } from './metadata/member-metadata.mjs'
export type { DecoratorMetadata } from './metadata/decorator-metadata.mjs'
export { handlerChain } from './metadata/handler-chain.mjs'
export type { HandlerChain, HandlerChainInput } from './metadata/handler-chain.mjs'
export { resolveChain, runChain } from './metadata/run-chain.mjs'
export type { ResolvedChain } from './metadata/run-chain.mjs'
export type { Guard, GuardClass } from './guards/guard.mjs'
export type { Interceptor, InterceptorClass } from './interceptors/interceptor.mjs'

// Execution contexts.
export { BasicExecutionContext } from './execution/basic-execution-context.mjs'
export type { BasicExecutionContextInit } from './execution/basic-execution-context.mjs'
export { runInContext } from './execution/async-context.mjs'
export { needsScope } from './execution/context-host.mjs'
export type { ContextHost } from './execution/context-host.mjs'
export type { AttributeMap, ExecutionContext, HandlerInfo } from './execution/execution-context.mjs'
