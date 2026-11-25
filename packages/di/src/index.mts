import './symbol-metadata.mjs'

export { Container, ScopedContainer } from './container/index.mjs'
export { Factory, Injectable } from './decorators/index.mjs'
export { DIError, DIErrorCode } from './errors/index.mjs'
export { EventEmitter } from './event-emitter.mjs'
export { InjectableScope } from './injectable-scope.mjs'
export { asyncInject, inject, optional } from './injection/index.mjs'
export { provide, registerFactory, registerInjectable } from './provider/index.mjs'
export { isStandardSchema, validateSync } from './schema/index.mjs'
export {
  BoundInjectionToken,
  FactoryInjectionToken,
  findInjectableToken,
  getInjectableToken,
  InjectableTokenMeta,
  InjectionToken,
} from './token/index.mjs'

export type { ContainerOptions, IContainer } from './container/index.mjs'
export type { FactoryOptions, InjectableOptions } from './decorators/index.mjs'
export type { EventsArgs, EventsConfig, EventsNames } from './event-emitter.mjs'
export type {
  AsyncResolve,
  IsUnion,
  Join,
  MissingArgsError,
  OptionalResolve,
  PopUnion,
  SyncResolve,
  UnionToArray,
  UnionToIntersection,
  UnionToOvlds,
} from './injection/index.mjs'
export type { OnServiceDestroy, OnServiceInit } from './lifecycle-hooks.mjs'
export type {
  Factorable,
  FactorableWithArgs,
  FactoryContext,
  Provider,
  ProviderInput,
  ProviderKind,
  ProviderRecord,
  RegisterFactoryOptions,
  RegisterInjectableOptions,
} from './provider/index.mjs'
export type {
  InferInput,
  InferOutput,
  StandardSchemaIssue,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaTypes,
  StandardSchemaV1,
} from './schema/index.mjs'
export type {
  AnyInjectableType,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
  ClassTypeWithInstanceAndOptionalArgument,
  ClassTypeWithOptionalArgument,
  ClassTypeWithoutArguments,
  InjectionTokenOptions,
  InjectionTokenSchemaType,
  InjectionTokenType,
  TokenArgsRequired,
} from './token/index.mjs'
