import type { AnyZodObject, z, ZodOptional } from 'zod'

import type { ClassType } from './injection-token.mjs'

import { getInjectableToken } from './decorators/index.mjs'
import { InjectionToken } from './injection-token.mjs'
import { getServiceLocator } from './injector.mjs'

let promiseCollector: null | ((promise: Promise<any>) => void) = null

export function syncInject<T extends ClassType>(token: T): InstanceType<T>
export function syncInject<T, S extends AnyZodObject>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): T
export function syncInject<T, S extends ZodOptional<AnyZodObject>>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): T

export function syncInject<T>(token: InjectionToken<T, undefined>): T
export function syncInject<
  T,
  Token extends InjectionToken<T>,
  S extends AnyZodObject | unknown = Token['schema'],
>(token: Token, args?: S extends AnyZodObject ? z.input<S> : never): T {
  if (token.schema) {
    const parsed = token.schema.safeParse(args)
    if (!parsed.success) {
      throw new Error(
        `[ServiceLocator] Invalid arguments for ${token.name.toString()}: ${parsed.error}`,
      )
    }
  }
  let realToken: InjectionToken<T, S> = token
  if (!(token instanceof InjectionToken)) {
    realToken = getInjectableToken(token) as InjectionToken<T, S>
  }

  const instance = getServiceLocator().getSyncInstance(realToken, args)
  if (!instance) {
    if (promiseCollector) {
      const promise = getServiceLocator().getInstance(realToken, args)
      promiseCollector(promise)
    } else {
      throw new Error(
        `[ServiceLocator] No instance found for ${realToken.name.toString()}`,
      )
    }
  }
  return instance as unknown as T
}

export function setPromiseCollector(
  collector: null | ((promise: Promise<any>) => void),
): typeof promiseCollector {
  const original = promiseCollector
  promiseCollector = collector
  return original
}
