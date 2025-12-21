/**
 * E2E tests for @navios/di running with SyncLocalStorage (browser mode).
 *
 * This file tests the browser implementation by directly importing from
 * the browser-specific async-local-storage module.
 *
 * The key difference: In browser mode, AsyncLocalStorage context does NOT
 * propagate across async boundaries. This affects circular dependency detection
 * for async operations, but synchronous DI operations should work identically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnServiceDestroy } from '../interfaces/on-service-destroy.interface.mjs'
import type { OnServiceInit } from '../interfaces/on-service-init.interface.mjs'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { isUsingNativeAsyncLocalStorage } from '../internal/context/async-local-storage.browser.mjs'
import { Registry } from '../token/registry.mjs'
import { getInjectors } from '../utils/get-injectors.mjs'

// ============================================================================
// TEST UTILITIES
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createTestSetup() {
  const registry = new Registry()
  const injectors = getInjectors()
  const container = new Container(registry, null, injectors)

  return { registry, injectors, container }
}

// ============================================================================
// VERIFY BROWSER MODE
// ============================================================================

describe('Browser Mode Verification', () => {
  it('should be using sync polyfill', () => {
    expect(isUsingNativeAsyncLocalStorage()).toBe(false)
  })
})

// ============================================================================
// SECTION 1: BASIC SETUP TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Basic Setup', () => {
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

  describe('Simple service registration and resolution', () => {
    it('should register and resolve a simple singleton service', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SimpleService {
        getValue() {
          return 'hello'
        }
      }

      const instance = await container.get(SimpleService)
      expect(instance).toBeInstanceOf(SimpleService)
      expect(instance.getValue()).toBe('hello')
    })

    it('should return the same instance for singleton services', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SingletonService {
        id = Math.random()
      }

      const instance1 = await container.get(SingletonService)
      const instance2 = await container.get(SingletonService)

      expect(instance1).toBe(instance2)
      expect(instance1.id).toBe(instance2.id)
    })

    it('should return different instances for transient services', async () => {
      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientService {
        id = Math.random()
      }

      const instance1 = await container.get(TransientService)
      const instance2 = await container.get(TransientService)

      expect(instance1).not.toBe(instance2)
      expect(instance1.id).not.toBe(instance2.id)
    })
  })

  describe('Service with dependencies', () => {
    it('should resolve a service that depends on another singleton', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class DatabaseService {
        connect() {
          return 'connected'
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class UserRepository {
        private db = injectors.inject(DatabaseService)

        async getDatabase() {
          return this.db
        }
      }

      const repo = await container.get(UserRepository)
      const db = await repo.getDatabase()
      expect(db).toBeInstanceOf(DatabaseService)
      expect(db.connect()).toBe('connected')
    })

    it('should resolve deep dependency chains', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ServiceLevel1 {
        name = 'Level1'
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ServiceLevel2 {
        private level1 = injectors.inject(ServiceLevel1)
        name = 'Level2'

        async getLevel1() {
          return this.level1
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ServiceLevel3 {
        private level2 = injectors.inject(ServiceLevel2)
        name = 'Level3'

        async getLevel2() {
          return this.level2
        }
      }

      const level3 = await container.get(ServiceLevel3)
      expect(level3.name).toBe('Level3')

      const level2 = await level3.getLevel2()
      expect(level2.name).toBe('Level2')

      const level1 = await level2.getLevel1()
      expect(level1.name).toBe('Level1')
    })
  })
})

// ============================================================================
// SECTION 2: MIXED SCOPES TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Mixed Scopes', () => {
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

  describe('Singleton with Request-scoped dependencies', () => {
    it('should create different request-scoped instances for different requests', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        id = ++instanceCount
      }

      // First request
      const scoped1 = container.beginRequest('request-1')
      const service1 = await scoped1.get(RequestService)

      // Second request
      const scoped2 = container.beginRequest('request-2')
      const service2 = await scoped2.get(RequestService)

      expect(service1.id).toBe(1)
      expect(service2.id).toBe(2)
      expect(service1).not.toBe(service2)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })
  })

  describe('Transient within different scopes', () => {
    it('should create new transient instance every time regardless of scope', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Transient, registry })
      class TransientService {
        id = ++instanceCount
      }

      // From main container
      const t1 = await container.get(TransientService)
      const t2 = await container.get(TransientService)

      // From scoped container
      const scoped = container.beginRequest('request-1')
      const t3 = await scoped.get(TransientService)
      const t4 = await scoped.get(TransientService)

      expect(t1.id).toBe(1)
      expect(t2.id).toBe(2)
      expect(t3.id).toBe(3)
      expect(t4.id).toBe(4)

      await scoped.endRequest()
    })
  })

  describe('Complex dependency graphs', () => {
    it('should handle complex dependency graph with all scope types', async () => {
      const creationOrder: string[] = []

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class DatabaseConnection {
        constructor() {
          creationOrder.push('DatabaseConnection')
        }
        query() {
          return 'query result'
        }
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestLogger {
        private db = injectors.inject(DatabaseConnection)

        constructor() {
          creationOrder.push('RequestLogger')
        }

        async log(msg: string) {
          const db = await this.db
          return `${msg} - ${db.query()}`
        }
      }

      @Injectable({ scope: InjectableScope.Transient, registry })
      class ActionHandler {
        private logger = injectors.inject(RequestLogger)

        constructor() {
          creationOrder.push('ActionHandler')
        }

        async handle() {
          const log = await this.logger
          return log.log('action')
        }
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestProcessor {
        private action = injectors.inject(ActionHandler)

        constructor() {
          creationOrder.push('RequestProcessor')
        }

        async process() {
          const handler = await this.action
          return handler.handle()
        }
      }

      const scoped = container.beginRequest('request-1')

      const processor = await scoped.get(RequestProcessor)
      const result = await processor.process()

      expect(result).toBe('action - query result')
      expect(creationOrder).toContain('DatabaseConnection')
      expect(creationOrder).toContain('RequestLogger')
      expect(creationOrder).toContain('ActionHandler')
      expect(creationOrder).toContain('RequestProcessor')

      await scoped.endRequest()
    })
  })
})

// ============================================================================
// SECTION 3: CONCURRENT REQUEST TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Concurrent Requests', () => {
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

  describe('Parallel request processing', () => {
    it('should share singleton across all concurrent requests', async () => {
      let singletonCreationCount = 0

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SharedCache {
        id = ++singletonCreationCount
        private data = new Map<string, string>()

        set(key: string, value: string) {
          this.data.set(key, value)
        }

        get(key: string) {
          return this.data.get(key)
        }
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestService {
        private cache = injectors.inject(SharedCache)

        async setInCache(key: string, value: string) {
          const c = await this.cache
          c.set(key, value)
          return c.id
        }

        async getFromCache(key: string) {
          const c = await this.cache
          return c.get(key)
        }
      }

      // Start multiple requests that all use the cache
      const requests = Array.from({ length: 10 }, async (_, i) => {
        const scoped = container.beginRequest(`request-${i}`)
        const service = await scoped.get(RequestService)
        const cacheId = await service.setInCache(`key-${i}`, `value-${i}`)
        await scoped.endRequest()
        return cacheId
      })

      const cacheIds = await Promise.all(requests)

      // All requests should have used the same singleton
      expect(singletonCreationCount).toBe(1)
      expect(new Set(cacheIds).size).toBe(1)
    })

    it('should handle race conditions when creating the same singleton', async () => {
      let creationCount = 0
      let constructorCallCount = 0

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SlowSingleton {
        id: number

        constructor() {
          constructorCallCount++
          this.id = ++creationCount
        }
      }

      // Try to get the same singleton from many places concurrently
      const results = await Promise.all([
        container.get(SlowSingleton),
        container.get(SlowSingleton),
        container.get(SlowSingleton),
        container.get(SlowSingleton),
        container.get(SlowSingleton),
      ])

      // All should be the same instance
      const uniqueInstances = new Set(results)
      expect(uniqueInstances.size).toBe(1)
      expect(creationCount).toBe(1)
      expect(constructorCallCount).toBe(1)
    })
  })
})

// ============================================================================
// SECTION 4: SERVICE LIFECYCLE TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Service Lifecycle', () => {
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

  describe('OnServiceInit lifecycle', () => {
    it('should call onServiceInit when service is created', async () => {
      const initSpy = vi.fn()

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ServiceWithInit implements OnServiceInit {
        initialized = false

        async onServiceInit() {
          initSpy()
          this.initialized = true
        }
      }

      const service = await container.get(ServiceWithInit)

      expect(initSpy).toHaveBeenCalledTimes(1)
      expect(service.initialized).toBe(true)
    })

    it('should call onServiceInit for request-scoped services in each request', async () => {
      let initCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestServiceWithInit implements OnServiceInit {
        initOrder = 0

        onServiceInit() {
          this.initOrder = ++initCount
        }
      }

      const scoped1 = container.beginRequest('request-1')
      const service1 = await scoped1.get(RequestServiceWithInit)

      const scoped2 = container.beginRequest('request-2')
      const service2 = await scoped2.get(RequestServiceWithInit)

      expect(service1.initOrder).toBe(1)
      expect(service2.initOrder).toBe(2)
      expect(initCount).toBe(2)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })
  })

  describe('OnServiceDestroy lifecycle', () => {
    it('should call onServiceDestroy when container is disposed', async () => {
      const destroySpy = vi.fn()

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ServiceWithDestroy implements OnServiceDestroy {
        onServiceDestroy() {
          destroySpy()
        }
      }

      await container.get(ServiceWithDestroy)
      expect(destroySpy).not.toHaveBeenCalled()

      await container.dispose()
      expect(destroySpy).toHaveBeenCalledTimes(1)
    })

    it('should call onServiceDestroy for request-scoped services when request ends', async () => {
      const destroySpy = vi.fn()

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestServiceWithDestroy implements OnServiceDestroy {
        onServiceDestroy() {
          destroySpy()
        }
      }

      const scoped = container.beginRequest('request-1')
      await scoped.get(RequestServiceWithDestroy)

      expect(destroySpy).not.toHaveBeenCalled()

      await scoped.endRequest()
      expect(destroySpy).toHaveBeenCalledTimes(1)
    })

    it('should handle async onServiceDestroy', async () => {
      const events: string[] = []

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class SlowDestroyService implements OnServiceDestroy {
        async onServiceDestroy() {
          events.push('destroy-start')
          await delay(10)
          events.push('destroy-end')
        }
      }

      await container.get(SlowDestroyService)
      await container.dispose()

      expect(events).toEqual(['destroy-start', 'destroy-end'])
    })
  })

  describe('Combined lifecycle methods', () => {
    it('should call lifecycle methods in correct order', async () => {
      const events: string[] = []

      @Injectable({ scope: InjectableScope.Request, registry })
      class FullLifecycleService implements OnServiceInit, OnServiceDestroy {
        onServiceInit() {
          events.push('init')
        }

        onServiceDestroy() {
          events.push('destroy')
        }
      }

      const scoped = container.beginRequest('request-1')
      await scoped.get(FullLifecycleService)
      events.push('service-used')
      await scoped.endRequest()

      expect(events).toEqual(['init', 'service-used', 'destroy'])
    })
  })
})

// ============================================================================
// SECTION 5: INVALIDATION TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Service Invalidation', () => {
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

  describe('Basic invalidation', () => {
    it('should destroy service when invalidated', async () => {
      const destroySpy = vi.fn()
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class CachingService implements OnServiceDestroy {
        id = ++instanceCount

        onServiceDestroy() {
          destroySpy(this.id)
        }
      }

      const service1 = await container.get(CachingService)
      expect(service1.id).toBe(1)

      await container.invalidate(service1)
      expect(destroySpy).toHaveBeenCalledWith(1)

      // Getting service again should create new instance
      const service2 = await container.get(CachingService)
      expect(service2.id).toBe(2)
      expect(service2).not.toBe(service1)
    })

    it('should cascade invalidation to dependents', async () => {
      const destroyOrder: string[] = []

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class BaseService implements OnServiceDestroy {
        onServiceDestroy() {
          destroyOrder.push('BaseService')
        }
      }

      @Injectable({ scope: InjectableScope.Singleton, registry })
      class DependentService implements OnServiceDestroy {
        private base = injectors.inject(BaseService)

        async getBase() {
          return this.base
        }

        onServiceDestroy() {
          destroyOrder.push('DependentService')
        }
      }

      const dependent = await container.get(DependentService)
      await dependent.getBase() // ensure base is created

      const base = await container.get(BaseService)
      await container.invalidate(base)

      // Both should be destroyed
      expect(destroyOrder).toContain('BaseService')
      expect(destroyOrder).toContain('DependentService')
    })
  })
})

// ============================================================================
// SECTION 6: ERROR HANDLING TESTS (Browser Mode)
// ============================================================================

describe('E2E Browser: Error Handling', () => {
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
    try {
      await container.dispose()
    } catch {
      // Ignore dispose errors in error handling tests
    }
  })

  describe('Resolution errors', () => {
    it('should throw when resolving request-scoped service outside request context', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestOnlyService {}

      await expect(container.get(RequestOnlyService)).rejects.toThrow()
    })

    it('should throw when using duplicate request IDs', async () => {
      const scoped1 = container.beginRequest('duplicate-id')

      expect(() => container.beginRequest('duplicate-id')).toThrow()

      await scoped1.endRequest()
    })
  })

  describe('Initialization errors', () => {
    it('should propagate errors from onServiceInit', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class FailingInitService implements OnServiceInit {
        onServiceInit() {
          throw new Error('Init failed!')
        }
      }

      await expect(container.get(FailingInitService)).rejects.toThrow(
        'Init failed!',
      )
    })

    it('should propagate constructor errors', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class FailingConstructorService {
        constructor() {
          throw new Error('Constructor failed!')
        }
      }

      await expect(container.get(FailingConstructorService)).rejects.toThrow(
        'Constructor failed!',
      )
    })
  })
})

// ============================================================================
// SECTION 7: ADVANCED SCENARIOS (Browser Mode)
// ============================================================================

describe('E2E Browser: Advanced Scenarios', () => {
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

  describe('tryGetSync functionality', () => {
    it('should return null when service does not exist', () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class LazyService {}

      const result = container.tryGetSync<LazyService>(LazyService)
      expect(result).toBeNull()
    })

    it('should return instance when service exists', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class EagerService {
        value = 42
      }

      // First create the service
      await container.get(EagerService)

      // Now sync get should work
      const result = container.tryGetSync<EagerService>(EagerService)
      expect(result).not.toBeNull()
      expect(result!.value).toBe(42)
    })
  })

  describe('Container self-registration', () => {
    it('should allow injecting the Container itself', async () => {
      @Injectable({ scope: InjectableScope.Singleton, registry })
      class ContainerAwareService {
        private container = injectors.inject(Container)

        async getContainer() {
          return this.container
        }
      }

      const service = await container.get(ContainerAwareService)
      const injectedContainer = await service.getContainer()

      expect(injectedContainer).toBe(container)
    })
  })
})
