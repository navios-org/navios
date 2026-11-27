/**
 * What an application is made of whatever reaches it: dependency injection,
 * modules, plugins, lifecycle, configuration, logging, and the contracts a
 * transport builds on. Nothing here knows about HTTP; that is
 * `@navios/server`.
 */
import './internal/this-copy.mjs'

// By name: what @navios/di exports is not part of this package by itself.
export {
  asyncInject,
  BoundInjectionToken,
  Container,
  DIError,
  DIErrorCode,
  Factory,
  FactoryInjectionToken,
  getInjectableToken,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  optional,
  provide,
  registerFactory,
  registerInjectable,
  registerProvider,
  ScopedContainer,
} from '@navios/di'
export type {
  AnyInjectableType,
  AsyncResolve,
  ClassType,
  ClassTypeWithInstance,
  ContainerOptions,
  Factorable,
  FactorableWithArgs,
  FactoryContext,
  FactoryOptions,
  IContainer,
  InferInput,
  InferOutput,
  InjectableOptions,
  InjectionTokenOptions,
  InjectionTokenType,
  OnServiceDestroy,
  OnServiceInit,
  OptionalResolve,
  Provider,
  ProviderInfo,
  ProviderInput,
  RegisterFactoryOptions,
  RegisterInjectableOptions,
  ResolvedInstance,
  StandardSchemaIssue,
  StandardSchemaV1,
  SyncResolve,
} from '@navios/di'

export { Application, createApplication } from './application/application.mjs'
export type { ApplicationOptions } from './application/application-options.mjs'
export type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from './application/lifecycle-hooks.mjs'
export type { ShutdownHooksOptions } from './application/shutdown-signals.mjs'
export { AttributeFactory } from './attributes/attribute-factory.mjs'
export type {
  AttributeApplication,
  ClassAttribute,
  ClassSchemaAttribute,
} from './attributes/attribute-factory.mjs'
export type { AttributeValue } from './attributes/attribute-value.mjs'
export type { Path, PathValue } from './config/config-path.mjs'
export { ConfigService } from './config/config-service.mjs'
export type { ConfigServiceInterface } from './config/config-service.mjs'
export { envInt, envString } from './config/env.mjs'
export { EnvConfigProvider } from './config/env-config-provider.mjs'
export { provideConfig } from './config/provide-config.mjs'
export type {
  ConfigProviderOptions,
  ValidatedConfigProviderOptions,
} from './config/provide-config.mjs'
export { currentContext } from './execution/async-context.mjs'
export { createContextKey, PlainContextKey } from './execution/context-key.mjs'
export type { ContextKey, ContextValue } from './execution/context-key.mjs'
export type { AttributeMap, ExecutionContext, HandlerInfo } from './execution/execution-context.mjs'
export { ExecutionContextToken } from './execution/execution-context-token.mjs'
export type { Guard, GuardClass } from './guards/guard.mjs'
export { UseGuards } from './guards/use-guards.mjs'
export type { Interceptor, InterceptorClass } from './interceptors/interceptor.mjs'
export { UseInterceptors } from './interceptors/use-interceptors.mjs'
export { ConsoleLogger } from './logger/console-logger.mjs'
export type { ConsoleLoggerOptions } from './logger/console-logger-options.mjs'
export { filterLogLevels, LOG_LEVELS } from './logger/log-levels.mjs'
export type { LogLevel } from './logger/log-levels.mjs'
export { Logger, LoggerInstance } from './logger/logger.mjs'
export type { LoggerOptions } from './logger/logger.mjs'
export { LoggerOutput } from './logger/logger-output.mjs'
export type { LoggerService } from './logger/logger-output.mjs'
export { Module, registerModule } from './modules/module.mjs'
export type { ModuleOptions } from './modules/module-options.mjs'
export { definePlugin } from './plugins/plugin.mjs'
export type { PluginApi, PluginDefinition, PluginInstance } from './plugins/plugin.mjs'
export type { Transport, TransportFactory, TransportInstance } from './transports/transport.mjs'
