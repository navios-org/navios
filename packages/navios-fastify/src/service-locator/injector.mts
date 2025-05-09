import { ServiceLocator } from './service-locator.mjs'

let serviceLocator: ServiceLocator = new ServiceLocator()

export function provideServiceLocator(locator: ServiceLocator): ServiceLocator {
  const original = serviceLocator
  serviceLocator = locator
  return original
}

export function getServiceLocator(): ServiceLocator {
  if (!serviceLocator) {
    throw new Error(
      '[ServiceLocator] Service locator is not initialized. Please provide the service locator before using the @Injectable decorator.',
    )
  }
  return serviceLocator
}
