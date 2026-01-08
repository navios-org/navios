/**
 * Integration tests for scope upgrade behavior in the Container.
 *
 * These tests verify that ScopeTracker correctly upgrades Singleton services
 * to Request scope when they depend on Request-scoped services.
 *
 * Key scenarios:
 * 1. Simple Singleton -> Request upgrade
 * 2. Complex chains: Singleton -> Request -> Singleton -> Request
 * 3. Transient breaking the upgrade chain
 * 4. Storage movement and registry updates
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { Registry } from '../token/registry.mjs'
import { getInjectableToken } from '../utils/get-injectable-token.mjs'
import { getInjectors } from '../utils/get-injectors.mjs'

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestSetup() {
  const registry = new Registry()
  const injectors = getInjectors()
  const container = new Container(registry, null, injectors)

  return { registry, injectors, container }
}

// ============================================================================
// SECTION 1: SIMPLE SINGLETON -> REQUEST UPGRADE
// ============================================================================

describe('Scope Upgrade: Simple Singleton -> Request', () => {
  let registry: Registry
  let container: Container
  let injectors: ReturnType<typeof getInjectors>

  beforeEach(() => {
    const setup = createTestSetup()
    registry = setup.registry
    container = setup.container
    injectors = setup.injectors
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Basic upgrade behavior', () => {
    it('should upgrade Singleton to Request when it depends on Request-scoped service', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        private requestService = injectors.inject(RequestService)

        getRequestService() {
          return this.requestService
        }
      }

      const token = getInjectableToken(SingletonWithRequestDep)

      // Initially registered as Singleton
      expect(registry.get(token).scope).toBe(InjectableScope.Singleton)

      // Resolve within request context
      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonWithRequestDep)

      // After resolution, the scope should be upgraded to Request
      expect(registry.get(token).scope).toBe(InjectableScope.Request)

      await scoped.endRequest()
    })

    it('should create different instances for different requests after upgrade', async () => {
      let singletonInstanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        instanceId = ++singletonInstanceCount
        private requestService = injectors.inject(RequestService)

        getRequestService() {
          return this.requestService
        }
      }

      // First request
      const scoped1 = container.beginRequest('request-1')
      const instance1 = await scoped1.get(SingletonWithRequestDep)

      // Second request
      const scoped2 = container.beginRequest('request-2')
      const instance2 = await scoped2.get(SingletonWithRequestDep)

      // After scope upgrade, each request should get its own instance
      expect(instance1.instanceId).not.toBe(instance2.instanceId)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })

    it('should return same instance within the same request after upgrade', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        id = Math.random()
        private requestService = injectors.inject(RequestService)

        getRequestService() {
          return this.requestService
        }
      }

      const scoped = container.beginRequest('request-1')

      // First resolution triggers the scope upgrade
      const instance1 = await scoped.get(SingletonWithRequestDep)

      // The scope upgrade happens during the first resolution.
      // After the scope is upgraded in the registry, subsequent resolutions
      // will correctly use request storage and return the same instance.
      const instance2 = await scoped.get(SingletonWithRequestDep)

      // The instance should be the same after upgrade
      expect(instance1.id).toBe(instance2.id)
      expect(instance1).toBe(instance2)

      await scoped.endRequest()
    })
  })

  describe('Storage verification', () => {
    it('should move holder from singleton to request storage', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        private requestService = injectors.inject(RequestService)

        getRequestService() {
          return this.requestService
        }
      }

      const token = getInjectableToken(SingletonWithRequestDep)
      const singletonStorage = container.getStorage()

      const scoped = container.beginRequest('request-1')
      const requestStorage = scoped.getStorage()

      // Before resolution
      const instanceNameBefore = container
        .getNameResolver()
        .generateInstanceName(
          token,
          undefined,
          undefined,
          InjectableScope.Singleton,
        )

      // Resolve
      await scoped.get(SingletonWithRequestDep)

      // After resolution, the holder should NOT be in singleton storage with old name
      const singletonResult = singletonStorage.get(instanceNameBefore)
      expect(singletonResult).toBeNull()

      // It should be in request storage with new name
      const instanceNameAfter = container
        .getNameResolver()
        .generateInstanceName(
          token,
          undefined,
          'request-1',
          InjectableScope.Request,
        )
      const requestResult = requestStorage.get(instanceNameAfter)
      expect(requestResult).not.toBeNull()

      await scoped.endRequest()
    })
  })
})

// ============================================================================
// SECTION 2: COMPLEX DEPENDENCY CHAINS
// ============================================================================

describe('Scope Upgrade: Complex Chains', () => {
  let registry: Registry
  let container: Container
  let injectors: ReturnType<typeof getInjectors>

  beforeEach(() => {
    const setup = createTestSetup()
    registry = setup.registry
    container = setup.container
    injectors = setup.injectors
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Singleton -> Request -> Singleton -> Request chain', () => {
    it('should upgrade all Singletons in the chain that depend on Request-scoped', async () => {
      // Level 4: Request-scoped (bottom of chain)
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestLevel4 {
        id = Math.random()
      }

      // Level 3: Singleton that depends on Request -> should upgrade
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonLevel3 {
        id = Math.random()
        private dep = injectors.inject(RequestLevel4)
        getDep() {
          return this.dep
        }
      }

      // Level 2: Request-scoped
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestLevel2 {
        id = Math.random()
        private dep = injectors.inject(SingletonLevel3)
        getDep() {
          return this.dep
        }
      }

      // Level 1: Singleton that depends on Request -> should upgrade
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonLevel1 {
        id = Math.random()
        private dep = injectors.inject(RequestLevel2)
        getDep() {
          return this.dep
        }
      }

      const token1 = getInjectableToken(SingletonLevel1)
      const token3 = getInjectableToken(SingletonLevel3)

      // Initially both Singletons are Singleton scoped
      expect(registry.get(token1).scope).toBe(InjectableScope.Singleton)
      expect(registry.get(token3).scope).toBe(InjectableScope.Singleton)

      // Resolve within request context
      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonLevel1)

      // Both Singletons should be upgraded to Request scope
      expect(registry.get(token1).scope).toBe(InjectableScope.Request)
      expect(registry.get(token3).scope).toBe(InjectableScope.Request)

      await scoped.endRequest()
    })

    it('should create isolated instances for different requests in complex chain', async () => {
      let level1Count = 0
      let level3Count = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestLevel4 {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonLevel3 {
        instanceId = ++level3Count
        private dep = injectors.inject(RequestLevel4)
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestLevel2 {
        id = Math.random()
        private dep = injectors.inject(SingletonLevel3)
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonLevel1 {
        instanceId = ++level1Count
        private dep = injectors.inject(RequestLevel2)
      }

      // First request
      const scoped1 = container.beginRequest('request-1')
      const instance1 = await scoped1.get(SingletonLevel1)

      // Second request
      const scoped2 = container.beginRequest('request-2')
      const instance2 = await scoped2.get(SingletonLevel1)

      // Each request should have its own instances after upgrade
      expect(instance1.instanceId).not.toBe(instance2.instanceId)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })
  })

  describe('Multiple Singletons depending on same Request service', () => {
    it('should upgrade all dependent Singletons', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class SharedRequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonA {
        id = Math.random()
        private shared = injectors.inject(SharedRequestService)
        getShared() {
          return this.shared
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonB {
        id = Math.random()
        private shared = injectors.inject(SharedRequestService)
        getShared() {
          return this.shared
        }
      }

      const tokenA = getInjectableToken(SingletonA)
      const tokenB = getInjectableToken(SingletonB)

      expect(registry.get(tokenA).scope).toBe(InjectableScope.Singleton)
      expect(registry.get(tokenB).scope).toBe(InjectableScope.Singleton)

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonA)
      await scoped.get(SingletonB)

      // Both should be upgraded
      expect(registry.get(tokenA).scope).toBe(InjectableScope.Request)
      expect(registry.get(tokenB).scope).toBe(InjectableScope.Request)

      await scoped.endRequest()
    })

    it('should share the same Request-scoped instance within a request', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class SharedRequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonA {
        private shared = injectors.inject(SharedRequestService)
        getShared() {
          return this.shared
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonB {
        private shared = injectors.inject(SharedRequestService)
        getShared() {
          return this.shared
        }
      }

      const scoped = container.beginRequest('request-1')
      const a = await scoped.get(SingletonA)
      const b = await scoped.get(SingletonB)

      // Both should share the same Request-scoped instance
      const sharedFromA = a.getShared()
      const sharedFromB = b.getShared()
      expect(sharedFromA.id).toBe(sharedFromB.id)

      await scoped.endRequest()
    })
  })
})

// ============================================================================
// SECTION 3: TRANSIENT BREAKING THE CHAIN
// ============================================================================

describe('Scope Upgrade: Transient Breaking Chain', () => {
  let registry: Registry
  let container: Container
  let injectors: ReturnType<typeof getInjectors>

  beforeEach(() => {
    const setup = createTestSetup()
    registry = setup.registry
    container = setup.container
    injectors = setup.injectors
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Singleton -> Transient -> Request chain', () => {
    it('should NOT upgrade Singleton when Transient is in between', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientMiddle {
        id = Math.random()
        private requestService = injectors.inject(RequestService)
        getRequestService() {
          return this.requestService
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonTop {
        id = Math.random()
        private transient = injectors.inject(TransientMiddle)
        getTransient() {
          return this.transient
        }
      }

      const singletonToken = getInjectableToken(SingletonTop)

      // Initially Singleton
      expect(registry.get(singletonToken).scope).toBe(InjectableScope.Singleton)

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonTop)

      // Singleton should NOT be upgraded because Transient breaks the chain
      // Transient services are created fresh each time and don't trigger scope upgrade
      expect(registry.get(singletonToken).scope).toBe(InjectableScope.Singleton)

      await scoped.endRequest()
    })

    it('should keep Singleton shared across requests when Transient breaks chain', async () => {
      let singletonInstanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientMiddle {
        private requestService = injectors.inject(RequestService)
        getRequestService() {
          return this.requestService
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonTop {
        instanceId = ++singletonInstanceCount
        private transient = injectors.inject(TransientMiddle)
        getTransient() {
          return this.transient
        }
      }

      // First request
      const scoped1 = container.beginRequest('request-1')
      const instance1 = await scoped1.get(SingletonTop)

      // Second request
      const scoped2 = container.beginRequest('request-2')
      const instance2 = await scoped2.get(SingletonTop)

      // Same Singleton instance should be returned (no upgrade happened)
      expect(instance1.instanceId).toBe(instance2.instanceId)
      expect(instance1).toBe(instance2)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })

    it('should create new Transient instances for each resolution', async () => {
      let transientCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientMiddle {
        instanceId = ++transientCount
        private requestService = injectors.inject(RequestService)
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonTop {
        private transient = injectors.inject(TransientMiddle)
        getTransient() {
          return this.transient
        }
      }

      const scoped = container.beginRequest('request-1')

      const singleton = await scoped.get(SingletonTop)
      const transient1 = singleton.getTransient()

      // Get singleton again (same instance)
      const singletonAgain = await scoped.get(SingletonTop)
      singletonAgain.getTransient()

      // Since injectors.inject() caches the reference, they should be the same
      // But if we resolve TransientMiddle directly, it should be different
      const transientDirect = await scoped.get(TransientMiddle)
      expect(transientDirect.instanceId).not.toBe(transient1.instanceId)

      await scoped.endRequest()
    })
  })

  describe('Mixed chains with Transient', () => {
    it('should handle Singleton -> Request -> Transient -> Request correctly', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestBottom {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientMiddle {
        private bottom = injectors.inject(RequestBottom)
        getBottom() {
          return this.bottom
        }
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestTop {
        private transient = injectors.inject(TransientMiddle)
        getTransient() {
          return this.transient
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonRoot {
        private requestTop = injectors.inject(RequestTop)
        getRequestTop() {
          return this.requestTop
        }
      }

      const singletonToken = getInjectableToken(SingletonRoot)

      // Singleton depends directly on Request (not Transient), so it should be upgraded
      expect(registry.get(singletonToken).scope).toBe(InjectableScope.Singleton)

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonRoot)

      // Should be upgraded because it directly depends on Request-scoped
      expect(registry.get(singletonToken).scope).toBe(InjectableScope.Request)

      await scoped.endRequest()
    })
  })
})

// ============================================================================
// SECTION 4: EDGE CASES AND ERROR SCENARIOS
// ============================================================================

describe('Scope Upgrade: Edge Cases', () => {
  let registry: Registry
  let container: Container
  let injectors: ReturnType<typeof getInjectors>

  beforeEach(() => {
    const setup = createTestSetup()
    registry = setup.registry
    container = setup.container
    injectors = setup.injectors
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Singleton without Request dependencies', () => {
    it('should NOT upgrade Singleton that only depends on Singletons', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonDep {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonMain {
        private dep = injectors.inject(SingletonDep)
        getDep() {
          return this.dep
        }
      }

      const token = getInjectableToken(SingletonMain)

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonMain)

      // Should remain Singleton
      expect(registry.get(token).scope).toBe(InjectableScope.Singleton)

      await scoped.endRequest()
    })

    it('should NOT upgrade Singleton that only depends on Transients', async () => {
      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientDep {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonMain {
        private dep = injectors.inject(TransientDep)
        getDep() {
          return this.dep
        }
      }

      const token = getInjectableToken(SingletonMain)

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonMain)

      // Should remain Singleton
      expect(registry.get(token).scope).toBe(InjectableScope.Singleton)

      await scoped.endRequest()
    })
  })

  describe('Resolving from main container vs scoped container', () => {
    it('should throw when resolving Request-scoped from main container', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      // Should throw - Request services need a request context
      await expect(container.get(RequestService)).rejects.toThrow()
    })

    it('should resolve Singleton from main container without upgrade', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class PureSingleton {
        id = Math.random()
      }

      const token = getInjectableToken(PureSingleton)

      const instance = await container.get(PureSingleton)
      expect(instance).toBeDefined()
      expect(registry.get(token).scope).toBe(InjectableScope.Singleton)
    })
  })

  describe('Concurrent request handling with upgrades', () => {
    it('should handle concurrent requests with scope upgrades correctly', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        instanceId = ++instanceCount
        private requestService = injectors.inject(RequestService)
      }

      // Start multiple concurrent requests
      const scoped1 = container.beginRequest('request-1')
      const scoped2 = container.beginRequest('request-2')
      const scoped3 = container.beginRequest('request-3')

      const [instance1, instance2, instance3] = await Promise.all([
        scoped1.get(SingletonWithRequestDep),
        scoped2.get(SingletonWithRequestDep),
        scoped3.get(SingletonWithRequestDep),
      ])

      // After upgrade, each request should have its own instance
      const ids = [
        instance1.instanceId,
        instance2.instanceId,
        instance3.instanceId,
      ]
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)

      await Promise.all([
        scoped1.endRequest(),
        scoped2.endRequest(),
        scoped3.endRequest(),
      ])
    })
  })

  describe('Invalidation after scope upgrade', () => {
    it('should properly invalidate upgraded services', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        instanceId = ++instanceCount
        private requestService = injectors.inject(RequestService)
      }

      const scoped = container.beginRequest('request-1')
      const instance1 = await scoped.get(SingletonWithRequestDep)

      await scoped.invalidate(instance1)

      const instance2 = await scoped.get(SingletonWithRequestDep)

      // Should be a new instance after invalidation
      expect(instance1.instanceId).not.toBe(instance2.instanceId)

      await scoped.endRequest()
    })

    it('should destroy upgraded services when request ends', async () => {
      let destroyCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonWithRequestDep {
        private requestService = injectors.inject(RequestService)

        onServiceDestroy() {
          destroyCount++
        }
      }

      const scoped = container.beginRequest('request-1')
      await scoped.get(SingletonWithRequestDep)

      expect(destroyCount).toBe(0)

      await scoped.endRequest()

      // Service should be destroyed when request ends (since it's now Request-scoped)
      expect(destroyCount).toBe(1)
    })
  })
})
