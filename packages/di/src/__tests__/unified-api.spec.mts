import { describe, expect, it } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DefaultRequestContext } from '../internal/context/request-context.mjs'
import { HolderManager } from '../internal/holder/holder-manager.mjs'

describe('Unified API', () => {
  describe('Common methods between HolderManager and RequestContext', () => {
    it('should have the same basic API surface', () => {
      const holderManager = new HolderManager()
      const requestContext = new DefaultRequestContext(
        'test-request',
        100,
      )

      // Both should have the same common methods
      expect(typeof holderManager.size).toBe('function')
      expect(typeof requestContext.size).toBe('function')

      expect(typeof holderManager.isEmpty).toBe('function')
      expect(typeof requestContext.isEmpty).toBe('function')

      expect(typeof holderManager.filter).toBe('function')
      expect(typeof requestContext.filter).toBe('function')

      expect(typeof holderManager.clear).toBe('function')
      expect(typeof requestContext.clear).toBe('function')

      expect(typeof holderManager.delete).toBe('function')
      expect(typeof requestContext.delete).toBe('function')

      expect(typeof holderManager.getAllNames).toBe('function')
      expect(typeof requestContext.getAllNames).toBe('function')

      expect(typeof holderManager.getAllHolders).toBe('function')
      expect(typeof requestContext.getAllHolders).toBe('function')

      expect(typeof holderManager.createCreatingHolder).toBe('function')
      expect(typeof requestContext.createCreatingHolder).toBe('function')
    })

    it('should work with the same holder creation patterns', () => {
      const holderManager = new HolderManager()
      const requestContext = new DefaultRequestContext(
        'test-request',
        100,
      )

      // Both should be able to create holders the same way
      const [deferred1, holder1] = holderManager.createCreatingHolder(
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
      holderManager.set('Service1', holder1)
      requestContext.set('Service2', holder2)

      expect(holderManager.size()).toBe(1)
      expect(requestContext.size()).toBe(1)
    })

    it('should support the same filtering patterns', () => {
      const holderManager = new HolderManager()
      const requestContext = new DefaultRequestContext(
        'test-request',
        100,
      )

      // Create and store different types of holders
      const singletonHolder = holderManager.storeCreatedHolder(
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
      const singletons = holderManager.filter(
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
      const holderManager = new HolderManager()
      const requestContext = new DefaultRequestContext(
        'test-request',
        100,
      )

      // HolderManager has specific error handling
      const [notFound] = holderManager.get('NonExistent')
      expect(notFound).toBeDefined()

      // RequestContext has specific request features
      expect(requestContext.requestId).toBe('test-request')
      expect(requestContext.priority).toBe(100)
      expect(requestContext.metadata).toBeInstanceOf(Map)
    })
  })
})
