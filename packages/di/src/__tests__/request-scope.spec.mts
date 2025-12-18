import { beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { inject } from '../index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { Registry } from '../token/registry.mjs'
import { ScopedContainer } from '../container/scoped-container.mjs'

describe('Request Scope', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  describe('Request-scoped services with ScopedContainer', () => {
    it('should create different instances for different requests', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
        public readonly createdAt = new Date()
      }

      // Start first request - get a ScopedContainer
      const scoped1 = container.beginRequest('request-1')
      const instance1a = await scoped1.get(RequestService)
      const instance1b = await scoped1.get(RequestService)

      // Start second request - get another ScopedContainer
      const scoped2 = container.beginRequest('request-2')
      const instance2a = await scoped2.get(RequestService)
      const instance2b = await scoped2.get(RequestService)

      // Within same request, instances should be the same
      expect(instance1a).toBe(instance1b)
      expect(instance2a).toBe(instance2b)

      // Between different requests, instances should be different
      expect(instance1a).not.toBe(instance2a)
      expect(instance1a.requestId).not.toBe(instance2a.requestId)

      // Clean up
      await scoped1.endRequest()
      await scoped2.endRequest()
    })

    it('should handle request context lifecycle correctly', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
        public destroyed = false

        async onServiceDestroy() {
          this.destroyed = true
        }
      }

      // Start request - get a ScopedContainer
      const scoped = container.beginRequest('test-request')

      const instance = await scoped.get(RequestService)
      expect(instance.destroyed).toBe(false)

      // End request should trigger cleanup
      await scoped.endRequest()
      expect(instance.destroyed).toBe(true)
    })

    it('should support request metadata', async () => {
      const requestId = 'test-request'
      const metadata = { userId: 'user123', sessionId: 'session456' }

      const scoped = container.beginRequest(requestId, metadata)

      // Verify metadata is accessible from the scoped container
      expect(scoped.getRequestId()).toBe(requestId)
      expect(scoped.getMetadata('userId')).toBe('user123')
      expect(scoped.getMetadata('sessionId')).toBe('session456')

      await scoped.endRequest()
    })

    it('should handle pre-prepared instances', async () => {
      const token = InjectionToken.create<{ value: string }>('PrePrepared')

      @Injectable({ registry, scope: InjectableScope.Request, token })
      class RequestService {
        constructor(public readonly value: string = 'default') {}
      }

      const scoped = container.beginRequest('test-request')

      // Add a pre-prepared instance
      const prePreparedInstance = { value: 'pre-prepared' }
      scoped.addInstance(token, prePreparedInstance)

      // Getting the service should return the pre-prepared instance
      const instance = await scoped.get(token)
      expect(instance).toBe(prePreparedInstance)

      await scoped.endRequest()
    })

    it('should throw error when resolving request-scoped service from Container directly', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId = Math.random().toString(36)
      }

      // Trying to resolve request-scoped service from Container should throw
      await expect(container.get(RequestService)).rejects.toThrow(
        /Cannot resolve request-scoped service/,
      )
    })

    it('should throw error when creating duplicate request ID', () => {
      container.beginRequest('request-1')

      // Creating another request with the same ID should throw
      expect(() => container.beginRequest('request-1')).toThrow(
        /Request context "request-1" already exists/,
      )
    })

    it('should allow reusing request ID after ending the request', async () => {
      const scoped1 = container.beginRequest('request-1')
      await scoped1.endRequest()

      // Should be able to create a new request with the same ID
      const scoped2 = container.beginRequest('request-1')
      expect(scoped2).toBeInstanceOf(ScopedContainer)
      await scoped2.endRequest()
    })
  })

  describe('ScopedContainer delegation', () => {
    it('should delegate singleton resolution to parent Container', async () => {
      @Injectable({ registry })
      class SingletonService {
        public readonly id = Math.random()
      }

      const scoped = container.beginRequest('test-request')

      // Get singleton from scoped container
      const instance1 = await scoped.get(SingletonService)

      // Get singleton from main container
      const instance2 = await container.get(SingletonService)

      // Should be the same instance
      expect(instance1).toBe(instance2)

      await scoped.endRequest()
    })

    it('should delegate transient resolution to parent Container', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientService {
        public readonly id = Math.random()
      }

      const scoped = container.beginRequest('test-request')

      // Each get should create a new instance
      const instance1 = await scoped.get(TransientService)
      const instance2 = await scoped.get(TransientService)

      expect(instance1).not.toBe(instance2)

      await scoped.endRequest()
    })

    it('should allow request-scoped services to depend on singletons', async () => {
      @Injectable({ registry })
      class SingletonService {
        public readonly id = Math.random()
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        singleton = inject(SingletonService)
        public readonly id = Math.random()
      }

      const scoped = container.beginRequest('test-request')

      const requestInstance = await scoped.get(RequestService)
      const singletonFromRequest = requestInstance.singleton
      const singletonDirect = await container.get(SingletonService)

      // The singleton injected into the request service should be the same
      // as the one from the main container
      expect(singletonFromRequest).toBe(singletonDirect)

      await scoped.endRequest()
    })
  })

  describe('Request isolation (race condition prevention)', () => {
    it('should prevent duplicate initialization during concurrent resolution within same request', async () => {
      let initializationCount = 0

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly instanceId: string

        constructor() {
          initializationCount++
          this.instanceId = Math.random().toString(36)
        }

        async onServiceInit() {
          // Simulate async initialization that takes time
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      const scoped = container.beginRequest('test-request')

      // Fire multiple concurrent resolution requests for the same service
      const [instance1, instance2, instance3] = await Promise.all([
        scoped.get(RequestService),
        scoped.get(RequestService),
        scoped.get(RequestService),
      ])

      // All instances should be the same (no duplicate initialization)
      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
      expect(initializationCount).toBe(1) // Only initialized once

      await scoped.endRequest()
    })

    it('should return correct instance when waiting for in-progress creation', async () => {
      let creationOrder: string[] = []

      @Injectable({ registry, scope: InjectableScope.Request })
      class SlowService {
        public readonly id: string

        constructor() {
          this.id = Math.random().toString(36)
        }

        async onServiceInit() {
          creationOrder.push('init-start')
          // Simulate slow async initialization
          await new Promise((resolve) => setTimeout(resolve, 100))
          creationOrder.push('init-end')
        }
      }

      const scoped = container.beginRequest('test-request')

      // Start first resolution (will start creating)
      const promise1 = scoped.get(SlowService)
      creationOrder.push('promise1-started')

      // Start second resolution while first is still in progress
      await new Promise((resolve) => setTimeout(resolve, 10))
      creationOrder.push('promise2-starting')
      const promise2 = scoped.get(SlowService)

      const [instance1, instance2] = await Promise.all([promise1, promise2])

      // Both should be the same instance
      expect(instance1).toBe(instance2)
      expect(instance1.id).toBe(instance2.id)

      // Verify the initialization only happened once
      expect(creationOrder.filter((x) => x === 'init-start').length).toBe(1)
      expect(creationOrder.filter((x) => x === 'init-end').length).toBe(1)

      await scoped.endRequest()
    })

    it('should isolate request contexts during concurrent async operations', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId: string

        constructor() {
          this.requestId = Math.random().toString(36)
        }
      }

      // Start two requests concurrently
      const scoped1 = container.beginRequest('request-1')
      const scoped2 = container.beginRequest('request-2')

      // Simulate concurrent async operations
      const [instance1, instance2] = await Promise.all([
        scoped1.get(RequestService),
        scoped2.get(RequestService),
      ])

      // Each request should have its own instance
      expect(instance1.requestId).not.toBe(instance2.requestId)

      // Verify they're still accessible after concurrent resolution
      const instance1Again = await scoped1.get(RequestService)
      const instance2Again = await scoped2.get(RequestService)

      expect(instance1).toBe(instance1Again)
      expect(instance2).toBe(instance2Again)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })

    it('should maintain correct context during interleaved async operations', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly requestId: string
        public value = 0

        constructor() {
          this.requestId = Math.random().toString(36)
        }

        async asyncOperation(delay: number): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, delay))
          this.value++
        }
      }

      const scoped1 = container.beginRequest('request-1')
      const scoped2 = container.beginRequest('request-2')

      const instance1 = await scoped1.get(RequestService)
      const instance2 = await scoped2.get(RequestService)

      // Start async operations with different delays
      await Promise.all([
        instance1.asyncOperation(50),
        instance2.asyncOperation(25),
        instance1.asyncOperation(10),
        instance2.asyncOperation(75),
      ])

      // Each instance should have been modified independently
      expect(instance1.value).toBe(2)
      expect(instance2.value).toBe(2)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })
  })

  describe('ScopedContainer API', () => {
    it('should implement IContainer interface', async () => {
      const scoped = container.beginRequest('test-request')

      // Check that all IContainer methods exist
      expect(typeof scoped.get).toBe('function')
      expect(typeof scoped.invalidate).toBe('function')
      expect(typeof scoped.isRegistered).toBe('function')
      expect(typeof scoped.dispose).toBe('function')
      expect(typeof scoped.ready).toBe('function')
      expect(typeof scoped.tryGetSync).toBe('function')

      await scoped.endRequest()
    })

    it('should track active request IDs in Container', async () => {
      expect(container.hasActiveRequest('request-1')).toBe(false)

      const scoped1 = container.beginRequest('request-1')
      expect(container.hasActiveRequest('request-1')).toBe(true)

      const scoped2 = container.beginRequest('request-2')
      expect(container.hasActiveRequest('request-2')).toBe(true)

      expect(container.getActiveRequestIds().size).toBe(2)

      await scoped1.endRequest()
      expect(container.hasActiveRequest('request-1')).toBe(false)
      expect(container.hasActiveRequest('request-2')).toBe(true)

      await scoped2.endRequest()
      expect(container.getActiveRequestIds().size).toBe(0)
    })

    it('should return parent Container from ScopedContainer', async () => {
      const scoped = container.beginRequest('test-request')
      expect(scoped.getParent()).toBe(container)
      await scoped.endRequest()
    })

    it('dispose() should be an alias for endRequest()', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public destroyed = false

        async onServiceDestroy() {
          this.destroyed = true
        }
      }

      const scoped = container.beginRequest('test-request')
      const instance = await scoped.get(RequestService)

      // Use dispose() instead of endRequest()
      await scoped.dispose()

      expect(instance.destroyed).toBe(true)
      expect(container.hasActiveRequest('test-request')).toBe(false)
    })
  })
})
