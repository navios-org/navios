import { NaviosException } from '@navios/common'

import type { ClassType } from '../injection-token.mjs'

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

export const InjectableTokenMeta = Symbol('InjectableTokenMeta')

export function Injectable({
  scope = InjectableScope.Singleton,
  type = InjectableType.Class,
  token,
}: InjectableOptions = {}) {
  return (target: ClassType, context: ClassDecoratorContext) => {
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

    return target
  }
}
