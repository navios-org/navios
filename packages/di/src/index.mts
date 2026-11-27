import './symbol-metadata.mjs'

export { Container } from './container/container.mjs'
export { ScopedContainer } from './container/scoped-container.mjs'
export { Factory } from './decorators/factory.mjs'
export { Injectable } from './decorators/injectable.mjs'
export { DIError, DIErrorCode } from './errors/di-error.mjs'
export { InjectableScope } from './injectable-scope.mjs'
export { asyncInject, inject, optional } from './internal/inject-impl.mjs'
export { provide } from './provider/provide.mjs'
export { registerFactory, registerInjectable, registerProvider } from './provider/registration.mjs'
export { getInjectableToken } from './token/injectable-token.mjs'
export {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './token/injection-token.mjs'

export type { ContainerOptions, InstanceDecoratorFor } from './container/container.mjs'
export type { IContainer } from './container/i-container.mjs'
export type { FactoryOptions } from './decorators/factory.mjs'
export type { InjectableOptions } from './decorators/injectable.mjs'
export type { MissingArgsError } from './injection/missing-args-error.mjs'
export type { AsyncResolve, OptionalResolve, SyncResolve } from './injection/resolve-signatures.mjs'
export type { OnServiceDestroy, OnServiceInit } from './lifecycle-hooks.mjs'
export type {
  Factorable,
  FactorableWithArgs,
  ProvidedFor,
  ResolvedInstance,
} from './provider/factorable.mjs'
export type { FactoryContext } from './provider/factory-context.mjs'
export type { Provider, ProviderInput, ProviderInputFor } from './provider/provide.mjs'
export type { ProviderInfo } from './provider/provider-record.mjs'
export type { RegisterFactoryOptions, RegisterInjectableOptions } from './provider/registration.mjs'
export type {
  InferInput,
  InferOutput,
  StandardSchemaIssue,
  StandardSchemaV1,
} from './schema/standard-schema.mjs'
export type { AbstractClassType, ClassType, ClassTypeWithInstance } from './token/class-type.mjs'
export type {
  AnyInjectableType,
  InjectionTokenOptions,
  InjectionTokenType,
} from './token/injection-token.mjs'
export type { PublicPart } from './token/public-part.mjs'
