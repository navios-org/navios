import type { FactoryContext } from './factory-context.mjs'
import type { ClassType } from './injection-token.mjs'

import { makeProxyServiceLocator } from './proxy-service-locator.mjs'
import { getInjectors } from './utils/index.mjs'

export async function resolveService<T extends ClassType>(
  ctx: FactoryContext,
  target: T,
  args: any[] = [],
): Promise<InstanceType<T>> {
  const proxyServiceLocator = makeProxyServiceLocator(ctx.locator, ctx)
  const { wrapSyncInit, provideServiceLocator } = getInjectors({
    baseLocator: ctx.locator,
  })
  const tryLoad = wrapSyncInit(() => {
    const original = provideServiceLocator(proxyServiceLocator)
    let result = new target(...args)
    provideServiceLocator(original)
    return result
  })
  let [instance, promises] = tryLoad()
  if (promises.length > 0) {
    await Promise.all(promises)
    const newRes = tryLoad()
    instance = newRes[0]
    promises = newRes[1]
  }
  if (promises.length > 0) {
    console.error(`[ServiceLocator] ${target.name} has problem with it's definition.

     One or more of the dependencies are registered as a InjectableScope.Instance and are used with syncInject.

     Please use inject instead of syncInject to load those dependencies.`)
    throw new Error(
      `[ServiceLocator] Service ${target.name} cannot be instantiated.`,
    )
  }

  return instance
}
