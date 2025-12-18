import type { z, ZodObject, ZodType } from 'zod/v4'

import type { FactoryContext } from '../factory-context.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithoutArguments,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../injection-token.mjs'
import type {
  Factorable,
  FactorableWithArgs,
} from '../interfaces/factory.interface.mjs'
import type {
  InjectRequest,
  InjectState,
  Join,
  UnionToArray,
} from './types.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface Injectors {
  // #1 Simple class
  asyncInject<T extends ClassTypeWithoutArguments>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  asyncInject<Args, T extends ClassTypeWithArgument<Args>>(
    token: T,
    args: Args,
  ): Promise<InstanceType<T>>
  asyncInject<
    Schema extends InjectionTokenSchemaType,
    R,
    T extends FactorableWithArgs<R, Schema>,
  >(
    token: T,
    args: z.input<Schema>,
  ): Promise<R>

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

  inject<T extends ClassTypeWithoutArguments>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
  inject<Args, T extends ClassTypeWithArgument<Args>>(
    token: T,
    args: Args,
  ): InstanceType<T>
  inject<
    Schema extends InjectionTokenSchemaType,
    R,
    T extends FactorableWithArgs<R, Schema>,
  >(
    token: T,
    args: z.input<Schema>,
  ): R

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

  /**
   * Optional injection that returns null if the service fails to initialize
   * or is not available. This is useful when you want to inject a service
   * that may not be configured or may fail gracefully.
   *
   * @example
   * ```ts
   * class MyService {
   *   constructor() {
   *     const optionalService = optional(OptionalServiceToken)
   *     // optionalService will be null if initialization fails
   *     if (optionalService) {
   *       optionalService.doSomething()
   *     }
   *   }
   * }
   * ```
   */
  optional<T extends ClassType>(
    token: T,
  ): (InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>) | null
  optional<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): T | null
  optional<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? T | null
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  optional<T>(token: InjectionToken<T, undefined>): T | null
  optional<T>(token: BoundInjectionToken<T, any>): T | null
  optional<T>(token: FactoryInjectionToken<T, any>): T | null

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

  function getRequest(token: InjectionToken<any>, args?: unknown) {
    if (!injectState) {
      throw new Error(
        '[Injector] Trying to make a request outside of a injectable context',
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
      return request
    }
    let result: any = null
    let error: Error | null = null
    const promise = getFactoryContext()
      .inject(token as any, args as any)
      .then((r) => {
        result = r
        return r
      })
      .catch((e) => {
        // We don't throw here because we have a mechanism to handle errors
        error = e
      })
    const request: InjectRequest = {
      token,
      promise,
      get result() {
        return result
      },
      get error() {
        return error
      },
    }
    injectState.requests.push(request)
    injectState.currentIndex++

    return request
  }

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
    // @ts-expect-error In case we have a class
    const realToken = token[InjectableTokenMeta] ?? token
    const request = getRequest(realToken, args)
    return request.promise.then((result) => {
      if (request.error) {
        // We throw here because we want to fail the asyncInject call if the dependency fails to initialize
        throw request.error
      }
      return result
    })
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

    const instance = getFactoryContext().container.tryGetSync(
      realToken,
      args,
    )
    if (!instance) {
      const request = getRequest(realToken, args)
      if (request.error) {
        throw request.error
      } else if (request.result) {
        return request.result
      }
      if (promiseCollector) {
        promiseCollector(request.promise)
      }
      // Return a dynamic proxy that looks up the instance when accessed
      return new Proxy(
        {},
        {
          get() {
            throw new Error(
              `[Injector] Trying to access ${realToken.toString()} before it's initialized, please move the code to a onServiceInit method`,
            )
          },
        },
      ) as unknown as T
    }
    return instance as unknown as T
  }

  function optional<
    T,
    Token extends
      | InjectionToken<T>
      | BoundInjectionToken<T, any>
      | FactoryInjectionToken<T, any>,
    S extends ZodObject | unknown = Token['schema'],
  >(token: Token, args?: S extends ZodObject ? z.input<S> : never): T | null {
    try {
      return inject(token, args)
    } catch {
      // If injection fails, return null instead of throwing
      return null
    }
  }

  const injectors: Injectors = {
    asyncInject,
    inject,
    optional,
    wrapSyncInit,
    provideFactoryContext,
  } as Injectors

  return injectors
}
