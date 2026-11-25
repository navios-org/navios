/**
 * The transport-neutral layer: what an application is made of whatever
 * reaches it. Nothing here knows about HTTP.
 *
 * This file is the future main entry of `@navios/core`; `index.mts` is the
 * future `@navios/server`, which re-exports it.
 */
export * from '@navios/di'
export { Application, createApplication } from './application/application.mjs'
export type { ApplicationOptions } from './application/application-options.mjs'
export type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from './application/lifecycle-hooks.mjs'
export * from './attributes/index.mjs'
export * from './config/index.mjs'
export { currentContext } from './execution/async-context.mjs'
export { createContextKey, PlainContextKey } from './execution/context-key.mjs'
export type { ContextKey, ContextValue } from './execution/context-key.mjs'
export type { AttributeMap, ExecutionContext, HandlerInfo } from './execution/execution-context.mjs'
export { ExecutionContextToken } from './execution/execution-context-token.mjs'
export type { Guard } from './guards/guard.mjs'
export { UseGuards } from './guards/use-guards.mjs'
export type { Interceptor } from './interceptors/interceptor.mjs'
export { UseInterceptors } from './interceptors/use-interceptors.mjs'
export * from './logger/index.mjs'
export { Module, registerModule } from './modules/module.mjs'
export {
  getModuleMetadata,
  hasModuleMetadata,
  ModuleMetadataKey,
} from './modules/module-metadata.mjs'
export type { ModuleMetadata } from './modules/module-metadata.mjs'
export type { ModuleOptions } from './modules/module-options.mjs'
export * from './plugins/index.mjs'
export type { Transport, TransportFactory, TransportInstance } from './transports/transport.mjs'
