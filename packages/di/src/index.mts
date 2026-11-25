import './symbol-metadata.mjs'

export { Container, ScopedContainer } from './container/index.mjs'
export { Factory, Injectable } from './decorators/index.mjs'
export { DIError, DIErrorCode } from './errors/index.mjs'
export { InjectableScope } from './injectable-scope.mjs'
export { asyncInject, inject, optional } from './injection/index.mjs'
export {
  provide,
  registerFactory,
  registerInjectable,
  registerProvider,
} from './provider/index.mjs'
export {
  BoundInjectionToken,
  FactoryInjectionToken,
  getInjectableToken,
  InjectionToken,
} from './token/index.mjs'

export type { ContainerOptions, IContainer } from './container/index.mjs'
export type { FactoryOptions, InjectableOptions } from './decorators/index.mjs'
export type {
  AsyncResolve,
  MissingArgsError,
  OptionalResolve,
  SyncResolve,
} from './injection/index.mjs'
export type { OnServiceDestroy, OnServiceInit } from './lifecycle-hooks.mjs'
export type {
  Factorable,
  FactorableWithArgs,
  FactoryContext,
  Provider,
  ProviderInfo,
  ProviderInput,
  RegisterFactoryOptions,
  RegisterInjectableOptions,
  RegisterProviderOptions,
  ResolvedInstance,
} from './provider/index.mjs'
export type {
  InferInput,
  InferOutput,
  StandardSchemaIssue,
  StandardSchemaV1,
} from './schema/index.mjs'
export type {
  AnyInjectableType,
  ClassType,
  ClassTypeWithInstance,
  InjectionTokenOptions,
  InjectionTokenType,
} from './token/index.mjs'
