import type { z, ZodObject, ZodType } from 'zod/v4'

import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { ServiceLocator } from '../service-locator.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface CreateInjectorsOptions {
  baseLocator: ServiceLocator
}
type Join<TElements, TSeparator extends string> =
  TElements extends Readonly<[infer First, ...infer Rest]>
    ? Rest extends ReadonlyArray<string>
      ? First extends string
        ? `${First}${Rest extends [] ? '' : TSeparator}${Join<Rest, TSeparator>}`
        : never
      : never
    : ''
// credits goes to https://stackoverflow.com/a/50375286
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

// Converts union to overloaded function
type UnionToOvlds<U> = UnionToIntersection<
  U extends any ? (f: U) => void : never
>

type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never

type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

type UnionToArray<T, A extends unknown[] = []> =
  IsUnion<T> extends true
    ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]>
    : [T, ...A]

export interface Injectors {
  // #1 Simple class
  inject<T extends ClassType>(token: T): Promise<InstanceType<T>>
  // #2 Token with required Schema
  inject<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  // #3 Token with optional Schema
  inject<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? Promise<T>
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  // #4 Token with no Schema
  inject<T>(token: InjectionToken<T, undefined>): Promise<T>
  inject<T>(token: BoundInjectionToken<T, any>): Promise<T>
  inject<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  syncInject<T extends ClassType>(token: T): InstanceType<T>
  syncInject<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): T
  // #3 Token with optional Schema
  syncInject<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? T
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  syncInject<T>(token: InjectionToken<T, undefined>): T
  syncInject<T>(token: BoundInjectionToken<T, any>): T
  syncInject<T>(token: FactoryInjectionToken<T, any>): T

  wrapSyncInit(cb: () => any): () => [any, Promise<any>[]]

  provideServiceLocator(locator: ServiceLocator): ServiceLocator
}

export const InjectorsBase = new Map<ServiceLocator, Injectors>()

export function getInjectors({ baseLocator }: CreateInjectorsOptions) {
  if (InjectorsBase.has(baseLocator)) {
    return InjectorsBase.get(baseLocator)!
  }
  let currentLocator: ServiceLocator = baseLocator

  function getServiceLocator() {
    if (!currentLocator) {
      throw new Error(
        '[Injector] Service locator is not initialized. Please provide the service locator before using the @Injectable decorator.',
      )
    }
    return currentLocator
  }
  function provideServiceLocator(locator: ServiceLocator): ServiceLocator {
    const original = currentLocator
    currentLocator = locator
    return original
  }

  function inject(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ) {
    // @ts-expect-error In case we have a class
    const realToken = token[InjectableTokenMeta] ?? token

    // @ts-expect-error We check the type in overload
    return getServiceLocator().getOrThrowInstance(realToken, args)
  }

  let promiseCollector: null | ((promise: Promise<any>) => void) = null

  function wrapSyncInit(cb: () => any) {
    return () => {
      const promises: Promise<any>[] = []
      const originalPromiseCollector = promiseCollector
      promiseCollector = (promise) => {
        promises.push(promise)
      }
      const result = cb()
      promiseCollector = originalPromiseCollector
      return [result, promises]
    }
  }

  function syncInject<
    T,
    Token extends
      | InjectionToken<T>
      | BoundInjectionToken<T, any>
      | FactoryInjectionToken<T, any>,
    S extends ZodObject<any> | unknown = Token['schema'],
  >(token: Token, args?: S extends ZodObject<any> ? z.input<S> : never): T {
    // @ts-expect-error In case we have a class
    const realToken = token[InjectableTokenMeta] ?? token

    const instance = getServiceLocator().getSyncInstance(realToken, args)
    if (!instance) {
      if (promiseCollector) {
        const promise = getServiceLocator().getInstance(realToken, args)
        promiseCollector(promise)
      } else {
        throw new Error(`[Injector] Cannot initiate ${realToken.toString()}`)
      }
      return new Proxy(
        {},
        {
          get() {
            throw new Error(
              `[Injector] Trying to access ${realToken.toString()} before it's initialized, please use inject() instead of syncInject() or do not use the value outside of class methods`,
            )
          },
        },
      ) as unknown as T
    }
    return instance as unknown as T
  }

  const injectors: Injectors = {
    inject,
    syncInject,
    wrapSyncInit,
    provideServiceLocator,
  } as Injectors
  InjectorsBase.set(baseLocator, injectors)

  return injectors
}
