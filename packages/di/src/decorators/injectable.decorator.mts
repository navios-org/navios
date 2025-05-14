import type { AnyZodObject } from 'zod'

import { NaviosException } from '@navios/common'

import { z } from 'zod'

import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  ClassTypeWithInstanceAndArgument,
} from '../injection-token.mjs'
import type { Factory, FactoryWithArgs } from '../interfaces/index.mjs'
import type { Registry } from '../registry.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { globalRegistry } from '../registry.mjs'
import { resolveService } from '../resolve-service.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'

export interface InjectableOptions {
  scope?: InjectableScope
  type?: InjectableType
  token?: InjectionToken<any, any>
  registry?: Registry
}

export function Injectable(): <T extends ClassType>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<InstanceType<T>, undefined> }
export function Injectable<R>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
}): <T extends ClassTypeWithInstance<Factory<R>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<R, undefined> }
export function Injectable<S extends AnyZodObject>(options: {
  scope?: InjectableScope
  type?: InjectableType.Class
  token: InjectionToken<undefined, S>
}): <T extends ClassTypeWithArgument<z.output<S>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<T, S> }
export function Injectable<R, S extends AnyZodObject>(options: {
  scope?: InjectableScope
  type?: InjectableType.Class
  token: InjectionToken<R, S>
}): <T extends ClassTypeWithInstanceAndArgument<R, z.output<S>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<R, S> }
export function Injectable<T extends ClassType>(options: {
  scope?: InjectableScope
  token: InjectionToken<T, undefined>
}): (
  target: T,
  context: ClassDecoratorContext,
) => T & {
  [InjectableTokenMeta]: InjectionToken<InstanceType<T>, undefined>
}

export function Injectable<R, S extends AnyZodObject>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
  token: InjectionToken<R, S>
}): <T extends ClassTypeWithInstance<FactoryWithArgs<R, S>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<R, S> }
export function Injectable<R>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
  token: InjectionToken<R, undefined>
}): <T extends ClassTypeWithInstance<Factory<R>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<R, undefined> }
export function Injectable({
  scope = InjectableScope.Singleton,
  type = InjectableType.Class,
  token,
  registry = globalRegistry,
}: InjectableOptions = {}) {
  return <T extends ClassType>(
    target: T,
    context: ClassDecoratorContext,
  ): T & {
    [InjectableTokenMeta]: InjectionToken<any, any>
  } => {
    if (context.kind !== 'class') {
      throw new Error(
        '[ServiceLocator] @Injectable decorator can only be used on classes.',
      )
    }
    let injectableToken: InjectionToken<any, any> =
      token ?? InjectionToken.create(target)
    if (type === InjectableType.Class) {
      registry.set(
        injectableToken,
        async (ctx, args: any) => resolveService(ctx, target, [args]),
        scope,
      )
    } else if (type === InjectableType.Factory) {
      registry.set(
        injectableToken,
        async (ctx, args: any) => {
          const builder = await resolveService(ctx, target)
          if (typeof builder.create !== 'function') {
            throw new NaviosException(
              `[ServiceLocator] Factory ${target.name} does not implement the create method.`,
            )
          }
          return builder.create(ctx, args)
        },
        scope,
      )
    }

    // @ts-expect-error
    target[InjectableTokenMeta] = injectableToken

    return target as T & {
      [InjectableTokenMeta]: InjectionToken<any, any>
    }
  }
}
