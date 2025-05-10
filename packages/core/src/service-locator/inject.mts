import type { AnyZodObject, z, ZodOptional } from 'zod'

import type { ClassType } from './injection-token.mjs'

import { getInjectableToken } from './decorators/index.mjs'
import { InjectionToken } from './injection-token.mjs'
import { getServiceLocator } from './injector.mjs'

export function inject<T extends ClassType>(token: T): Promise<InstanceType<T>>
export function inject<T, S extends AnyZodObject>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): Promise<T>
export function inject<T, S extends ZodOptional<AnyZodObject>>(
  token: InjectionToken<T, S>,
  args?: z.input<S>,
): Promise<T>

export function inject<T>(token: InjectionToken<T, undefined>): Promise<T>
export function inject<
  T,
  Token extends InjectionToken<T>,
  S extends AnyZodObject | unknown = Token['schema'],
>(
  token: Token,
  args?: S extends AnyZodObject ? z.input<S> : never,
): Promise<T> {
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

  return getServiceLocator().getOrThrowInstance(realToken, args)
}
