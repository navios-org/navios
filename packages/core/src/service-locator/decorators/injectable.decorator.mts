import type { ClassType } from '../injection-token.mjs'

import { InjectableScope } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { getServiceLocator, provideServiceLocator } from '../injector.mjs'
import { makeProxyServiceLocator } from '../proxy-service-locator.mjs'
import { setPromiseCollector } from '../sync-injector.mjs'

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
    if (!locator) {
      throw new Error(
        '[ServiceLocator] Service locator is not initialized. Please provide the service locator before using the @Injectable decorator.',
      )
    }
    if (type === InjectableType.Class) {
      locator.registerAbstractFactory(
        injectableToken,
        async (ctx) => {
          if (scope === InjectableScope.Instance) {
            ctx.setTtl(0)
          }
          const proxyServiceLocator = makeProxyServiceLocator(
            getServiceLocator(),
            ctx,
          )
          const promises: Promise<any>[] = []
          const promiseCollector = (promise: Promise<any>) => {
            promises.push(promise)
          }
          const originalPromiseCollector = setPromiseCollector(promiseCollector)
          const tryInit = () => {
            const original = provideServiceLocator(proxyServiceLocator)
            let result = new target()
            provideServiceLocator(original)
            return result
          }
          const result = tryInit()
          setPromiseCollector(originalPromiseCollector)
          if (promises.length > 0) {
            await Promise.all(promises)
            return tryInit()
          }
          return result
        },
        scope,
      )
    } else if (type === InjectableType.Factory) {
      locator.registerAbstractFactory(
        injectableToken,
        async (ctx, args: any) => {
          if (scope === InjectableScope.Instance) {
            ctx.setTtl(0)
          }
          const proxyServiceLocator = makeProxyServiceLocator(
            getServiceLocator(),
            ctx,
          )
          const original = provideServiceLocator(proxyServiceLocator)
          const builder = new target()
          if (typeof builder.create !== 'function') {
            throw new Error(
              `[ServiceLocator] Factory ${target.name} does not implement the create method.`,
            )
          }
          provideServiceLocator(original)
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
