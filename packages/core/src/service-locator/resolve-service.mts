import { NaviosException } from '@navios/common'

import type { ClassType } from './injection-token.mjs'
import type { ServiceLocatorAbstractFactoryContext } from './service-locator-abstract-factory-context.mjs'

import { getServiceLocator, provideServiceLocator } from './injector.mjs'
import { makeProxyServiceLocator } from './proxy-service-locator.mjs'
import { setPromiseCollector } from './sync-injector.mjs'

export async function resolveService<T extends ClassType>(
  ctx: ServiceLocatorAbstractFactoryContext,
  target: T,
  args: any[] = [],
): Promise<InstanceType<T>> {
  const proxyServiceLocator = makeProxyServiceLocator(getServiceLocator(), ctx)
  let promises: Promise<any>[] = []
  const promiseCollector = (promise: Promise<any>) => {
    promises.push(promise)
  }
  const originalPromiseCollector = setPromiseCollector(promiseCollector)
  const tryLoad = () => {
    const original = provideServiceLocator(proxyServiceLocator)
    let result = new target(...args)
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
    console.error(`[ServiceLocator] ${target.name} has problem with it's definition.
     
     One or more of the dependencies are registered as a InjectableScope.Instance and are used with syncInject.
     
     Please use inject instead of syncInject to load those dependencies.`)
    throw new NaviosException(
      `[ServiceLocator] Service ${target.name} cannot be instantiated.`,
    )
  }

  return instance
}
