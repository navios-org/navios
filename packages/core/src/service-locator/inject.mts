import type { AnyZodObject, z, ZodOptional } from 'zod'

import type { ClassType } from './injection-token.mjs'

import { getInjectableToken } from './decorators/index.mjs'
import { InjectionToken } from './injection-token.mjs'
import { getServiceLocator } from './injector.mjs'

export function inject<T extends ClassType>(token: T): Promise<InstanceType<T>>
// Not supported by TypeScript yet
// export function inject<
//   R,
//   T extends ClassType & {
//     [InjectableTokenMeta]: InjectionToken<R, undefined>
//   },
// >(token: T): Promise<R>
// export function inject<
//   R,
//   S extends AnyZodObject,
//   T extends ClassType & {
//     [InjectableTokenMeta]: InjectionToken<R, S>
//   },
// >(token: T, args: z.input<S>): Promise<R>
export function inject<T, S extends AnyZodObject>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): Promise<T>
export function inject<T, S extends ZodOptional<AnyZodObject>>(
  token: InjectionToken<T, S>,
  args?: z.input<S>,
): Promise<T>

export function inject<T>(token: InjectionToken<T, undefined>): Promise<T>
export function inject(token: InjectionToken<any>, args?: unknown) {
  let realToken = token
  if (!(token instanceof InjectionToken)) {
    realToken = getInjectableToken(token)
  }

  // @ts-expect-error We chek the type in overload
  return getServiceLocator().getOrThrowInstance(realToken, args)
}
