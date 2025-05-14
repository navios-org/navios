import type { AnyZodObject, z } from 'zod'

import type {
  BaseInjectionTokenSchemaType,
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  OptionalInjectionTokenSchemaType,
} from '../injection-token.mjs'
import type { ServiceLocator } from '../service-locator.mjs'

import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface CreateInjectorsOptions {
  baseLocator: ServiceLocator
}

export interface Injectors {
  inject<T extends ClassType>(token: T): Promise<InstanceType<T>>
  inject<T, S extends BaseInjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  inject<T, S extends OptionalInjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args?: z.input<S>,
  ): Promise<T>
  inject<T>(token: InjectionToken<T, undefined>): Promise<T>
  inject<T>(token: BoundInjectionToken<T, any>): Promise<T>
  inject<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  syncInject<T extends ClassType>(token: T): InstanceType<T>
  syncInject<T, S extends BaseInjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): T
  syncInject<T, S extends OptionalInjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args?: z.input<S>,
  ): T
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
    S extends AnyZodObject | unknown = Token['schema'],
  >(token: Token, args?: S extends AnyZodObject ? z.input<S> : never): T {
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
