import type { AnyZodObject } from 'zod'

import { NaviosException } from '@navios/common'

import type { ClassType, ClassTypeWithInstance } from '../injection-token.mjs'
import type {
  Factory,
  FactoryWithArgs,
} from '../interfaces/factory.interface.mjs'

import { InjectableScope } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { getServiceLocator } from '../injector.mjs'
import { resolveService } from '../resolve-service.mjs'

export enum InjectableType {
  Class = 'Class',
  Factory = 'Factory',
}

export interface InjectableOptions {
  scope?: InjectableScope
  type?: InjectableType
  token?: InjectionToken<any, any>
}

export const InjectableTokenMeta = Symbol.for('InjectableTokenMeta')

export function Injectable(): <T extends ClassType>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<InstanceType<T>, undefined> }
export function Injectable<T extends ClassType>(options: {
  scope?: InjectableScope
  token: InjectionToken<T, undefined>
}): (
  target: T,
  context: ClassDecoratorContext,
) => T & {
  [InjectableTokenMeta]: InjectionToken<InstanceType<T>, undefined>
}
export function Injectable<R>(options: {
  scope?: InjectableScope
  type: InjectableType.Factory
}): <T extends ClassTypeWithInstance<Factory<R>>>(
  target: T,
  context: ClassDecoratorContext,
) => T & { [InjectableTokenMeta]: InjectionToken<R, undefined> }
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
    const locator = getServiceLocator()
    if (type === InjectableType.Class) {
      locator.registerAbstractFactory(
        injectableToken,
        async (ctx) => resolveService(ctx, target),
        scope,
      )
    } else if (type === InjectableType.Factory) {
      locator.registerAbstractFactory(
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
