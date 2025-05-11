import { NaviosException } from '@navios/common'

import type { ClassType } from '../injection-token.mjs'
import type { ServiceLocatorAbstractFactoryContext } from '../service-locator-abstract-factory-context.mjs'

import { LoggerInstance } from '../../logger/index.mjs'
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

export async function resolveService<T extends ClassType>(
  ctx: ServiceLocatorAbstractFactoryContext,
  target: T,
): Promise<InstanceType<T>> {
  const proxyServiceLocator = makeProxyServiceLocator(getServiceLocator(), ctx)
  let promises: Promise<any>[] = []
  const promiseCollector = (promise: Promise<any>) => {
    promises.push(promise)
  }
  const originalPromiseCollector = setPromiseCollector(promiseCollector)
  const tryLoad = () => {
    const original = provideServiceLocator(proxyServiceLocator)
    let result = new target()
    provideServiceLocator(original)
    return result
  }
  let instance = tryLoad()
  setPromiseCollector(originalPromiseCollector)
  if (promises.length > 0) {
    await Promise.all(promises)
    promises = []
    instance = tryLoad()
  }
  if (promises.length > 0) {
    LoggerInstance.error(`[ServiceLocator] ${target.name} has problem with it's definition.
     
     One or more of the dependencies are registered as a InjectableScope.Instance and are used with syncInject.
     
     Please use inject instead of syncInject to load those dependencies.`)
    throw new NaviosException(
      `[ServiceLocator] Service ${target.name} cannot be instantiated.`,
    )
  }

  return instance
}
