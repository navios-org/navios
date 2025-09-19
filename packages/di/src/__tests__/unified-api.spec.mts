import { describe, expect, it } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DefaultRequestContextHolder } from '../request-context-holder.mjs'
import { ServiceLocatorManager } from '../service-locator-manager.mjs'

describe('Unified API', () => {
  describe('Common methods between ServiceLocatorManager and RequestContextHolder', () => {
    it('should have the same basic API surface', () => {
      const serviceManager = new ServiceLocatorManager()
      const requestContext = new DefaultRequestContextHolder(
        'test-request',
        100,
      )

      // Both should have the same common methods
      expect(typeof serviceManager.size).toBe('function')
      expect(typeof requestContext.size).toBe('function')

      expect(typeof serviceManager.isEmpty).toBe('function')
      expect(typeof requestContext.isEmpty).toBe('function')

      expect(typeof serviceManager.filter).toBe('function')
      expect(typeof requestContext.filter).toBe('function')

      expect(typeof serviceManager.clear).toBe('function')
      expect(typeof requestContext.clear).toBe('function')

      expect(typeof serviceManager.delete).toBe('function')
      expect(typeof requestContext.delete).toBe('function')

      expect(typeof serviceManager.getAllNames).toBe('function')
      expect(typeof requestContext.getAllNames).toBe('function')

      expect(typeof serviceManager.getAllHolders).toBe('function')
      expect(typeof requestContext.getAllHolders).toBe('function')

      expect(typeof serviceManager.createCreatingHolder).toBe('function')
      expect(typeof requestContext.createCreatingHolder).toBe('function')
    })

    it('should work with the same holder creation patterns', () => {
      const serviceManager = new ServiceLocatorManager()
      const requestContext = new DefaultRequestContextHolder(
        'test-request',
        100,
      )

      // Both should be able to create holders the same way
      const [deferred1, holder1] = serviceManager.createCreatingHolder(
        'Service1',
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      const [deferred2, holder2] = requestContext.createCreatingHolder(
        'Service2',
        InjectableType.Class,
        InjectableScope.Request,
      )

      expect(holder1.name).toBe('Service1')
      expect(holder1.scope).toBe(InjectableScope.Singleton)
      expect(holder2.name).toBe('Service2')
      expect(holder2.scope).toBe(InjectableScope.Request)

      // Both should be able to store holders
      serviceManager.set('Service1', holder1)
      requestContext.set('Service2', holder2)

      expect(serviceManager.size()).toBe(1)
      expect(requestContext.size()).toBe(1)
    })

    it('should support the same filtering patterns', () => {
      const serviceManager = new ServiceLocatorManager()
      const requestContext = new DefaultRequestContextHolder(
        'test-request',
        100,
      )

      // Create and store different types of holders
      const singletonHolder = serviceManager.storeCreatedHolder(
        'Singleton',
        {},
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      // Create a holder first, then add it to the request context
      const [, transientHolderTemp] = requestContext.createCreatingHolder(
        'Transient',
        InjectableType.Class,
        InjectableScope.Transient,
      )
      requestContext.set('Transient', transientHolderTemp)
      const transientHolder = transientHolderTemp

      // Both should support the same filtering API
      const singletons = serviceManager.filter(
        (holder) => holder.scope === InjectableScope.Singleton,
      )
      const transients = requestContext.filter(
        (holder) => holder.scope === InjectableScope.Transient,
      )

      expect(singletons.size).toBe(1)
      expect(transients.size).toBe(1)
      expect(singletons.get('Singleton')).toBe(singletonHolder)
      expect(transients.get('Transient')).toBe(transientHolder)
    })

    it('should maintain their specific behaviors while sharing common API', () => {
      const serviceManager = new ServiceLocatorManager()
      const requestContext = new DefaultRequestContextHolder(
        'test-request',
        100,
      )

      // ServiceLocatorManager has specific error handling
      const [notFound] = serviceManager.get('NonExistent')
      expect(notFound).toBeDefined()

      // RequestContextHolder has specific request features
      expect(requestContext.requestId).toBe('test-request')
      expect(requestContext.priority).toBe(100)
      expect(requestContext.metadata).toBeInstanceOf(Map)
    })
  })
})
