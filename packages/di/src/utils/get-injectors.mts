import type { z, ZodObject, ZodType } from 'zod/v4'

import type { FactoryContext } from '../factory-context.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { Factorable } from '../interfaces/factory.interface.mjs'
import type { ServiceLocator } from '../service-locator.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

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

export interface InjectState {
  currentIndex: number
  isFrozen: boolean
  requests: {
    token:
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>
      | ClassType
    promise: Promise<any>
  }[]
}

export interface Injectors {
  // #1 Simple class
  inject<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
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

  syncInject<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
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

  wrapSyncInit(
    cb: () => any,
  ): (injectState?: InjectState) => [any, Promise<any>[], InjectState]

  provideFactoryContext(context: FactoryContext | null): FactoryContext | null
}

export function getInjectors() {
  let currentFactoryContext: FactoryContext | null = null

  function provideFactoryContext(
    context: FactoryContext,
  ): FactoryContext | null {
    const original = currentFactoryContext
    currentFactoryContext = context
    return original
  }
  function getFactoryContext(): FactoryContext {
    if (!currentFactoryContext) {
      throw new Error(
        '[Injector] Trying to access injection context outside of a injectable context',
      )
    }
    return currentFactoryContext
  }

  let promiseCollector: null | ((promise: Promise<any>) => void) = null
  let injectState: InjectState | null = null

  function inject(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ) {
    if (!injectState) {
      throw new Error(
        '[Injector] Trying to access inject outside of a injectable context',
      )
    }
    if (injectState.isFrozen) {
      const idx = injectState.currentIndex++
      const request = injectState.requests[idx]
      if (request.token !== token) {
        throw new Error(
          `[Injector] Wrong token order. Expected ${request.token.toString()} but got ${token.toString()}`,
        )
      }
      return request.promise
    }

    const promise = getFactoryContext().inject(token as any, args as any)
    injectState.requests.push({
      token,
      promise,
    })
    injectState.currentIndex++

    return promise
  }

  function wrapSyncInit(cb: () => any) {
    return (previousState?: InjectState) => {
      const promises: Promise<any>[] = []
      const originalPromiseCollector = promiseCollector
      const originalInjectState = injectState
      injectState = previousState
        ? {
            ...previousState,
            currentIndex: 0,
          }
        : {
            currentIndex: 0,
            isFrozen: false,
            requests: [],
          }
      promiseCollector = (promise) => {
        promises.push(promise)
      }
      const result = cb()
      promiseCollector = originalPromiseCollector
      const newInjectState = {
        ...injectState,
        isFrozen: true,
      }
      injectState = originalInjectState
      return [result, promises, newInjectState]
    }
  }

  function syncInject<
    T,
    Token extends
      | InjectionToken<T>
      | BoundInjectionToken<T, any>
      | FactoryInjectionToken<T, any>,
    S extends ZodObject | unknown = Token['schema'],
  >(token: Token, args?: S extends ZodObject ? z.input<S> : never): T {
    // @ts-expect-error In case we have a class
    const realToken = token[InjectableTokenMeta] ?? token

    const instance = getFactoryContext().locator.getSyncInstance(
      realToken,
      args,
    )
    if (!instance) {
      if (promiseCollector) {
        const promise = getFactoryContext().inject(realToken, args)
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
    provideFactoryContext,
  } as Injectors

  return injectors
}
