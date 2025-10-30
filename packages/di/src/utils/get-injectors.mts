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
import type {
  InjectRequest,
  InjectState,
  Join,
  UnionToArray,
} from './types.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface Injectors {
  // #1 Simple class
  asyncInject<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  // #2 Token with required Schema
  asyncInject<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  // #3 Token with optional Schema
  asyncInject<T, S extends InjectionTokenSchemaType, R extends boolean>(
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
  asyncInject<T>(token: InjectionToken<T, undefined>): Promise<T>
  asyncInject<T>(token: BoundInjectionToken<T, any>): Promise<T>
  asyncInject<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  inject<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
  inject<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): T
  // #3 Token with optional Schema
  inject<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? T
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  inject<T>(token: InjectionToken<T, undefined>): T
  inject<T>(token: BoundInjectionToken<T, any>): T
  inject<T>(token: FactoryInjectionToken<T, any>): T

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

  function asyncInject(
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
      result: null,
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

  function inject<
    T,
    Token extends
      | InjectionToken<T>
      | BoundInjectionToken<T, any>
      | FactoryInjectionToken<T, any>,
    S extends ZodObject | unknown = Token['schema'],
  >(token: Token, args?: S extends ZodObject ? z.input<S> : never): T {
    // @ts-expect-error In case we have a class
    const realToken = token[InjectableTokenMeta] ?? token

    if (!injectState) {
      throw new Error(
        '[Injector] Trying to access inject outside of a injectable context',
      )
    }

    const instance = getFactoryContext().locator.getSyncInstance(
      realToken,
      args,
    )
    if (!instance) {
      if (injectState.isFrozen) {
        const idx = injectState.currentIndex++
        const request = injectState.requests[idx]
        if (!request) {
          throw new Error(
            `[Injector] No request found for ${realToken.toString()}`,
          )
        }
        if (request.token !== realToken) {
          throw new Error(
            `[Injector] Wrong token order. Expected ${request.token.toString()} but got ${token.toString()}`,
          )
        }
        return request.result
      }
      // Store the current factory context's locator for later lookups
      const ctx = getFactoryContext()

      // Support both promiseCollector (legacy) and injectState (new)
      if (promiseCollector || injectState) {
        let result: any = null
        const promise = ctx.inject(realToken, args).then((r) => {
          result = r
          return r
        })

        if (promiseCollector) {
          promiseCollector(promise)
        }

        // Also track in injectState
        const request: InjectRequest = {
          token: realToken,
          promise: promise,
          get result() {
            return result
          },
        }
        injectState.requests.push(request)
        injectState.currentIndex++
      } else {
        throw new Error(`[Injector] Cannot initiate ${realToken.toString()}`)
      }
      // Return a dynamic proxy that looks up the instance when accessed
      return new Proxy(
        {},
        {
          get() {
            throw new Error(
              `[Injector] Trying to access ${realToken.toString()} before it's initialized, please use asyncInject() instead of inject() or do not use the value outside of class methods`,
            )
          },
        },
      ) as unknown as T
    }
    return instance as unknown as T
  }

  const injectors: Injectors = {
    asyncInject,
    inject,
    wrapSyncInit,
    provideFactoryContext,
  } as Injectors

  return injectors
}
