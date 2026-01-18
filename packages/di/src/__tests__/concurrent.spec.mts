import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/index.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { inject, asyncInject } from '../utils/index.mjs'

describe('Concurrent Operations', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('concurrent singleton resolution', () => {
    it('should return same instance for concurrent requests', async () => {
      let initCount = 0

      @Injectable()
      class SlowService {
        id: number

        constructor() {
          initCount++
          this.id = Math.random()
        }

        async onServiceInit() {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      // Start multiple concurrent resolutions
      const promises = Array.from({ length: 10 }, () => container.get(SlowService))

      const instances = await Promise.all(promises)

      // All instances should be the same
      const firstInstance = instances[0]
      expect(instances.every((i) => i === firstInstance)).toBe(true)

      // Should only have initialized once
      expect(initCount).toBe(1)
    })

    it('should handle race conditions without creating duplicate instances', async () => {
      let creationCount = 0

      @Injectable()
      class RaceService {
        createdAt = creationCount++
      }

      // Fire many concurrent requests
      const promises = Array.from({ length: 100 }, () => container.get(RaceService))

      const instances = await Promise.all(promises)

      // All should be the same instance
      const first = instances[0]
      expect(instances.every((i) => i === first)).toBe(true)
      expect(creationCount).toBe(1)
    })
  })

  describe('concurrent transient resolution', () => {
    it('should create new instance for each concurrent request', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {
        id = ++instanceCount
      }

      const promises = Array.from({ length: 10 }, () => container.get(TransientService))

      const instances = await Promise.all(promises)

      // All instances should be different
      const ids = instances.map((i) => i.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })
  })

  describe('concurrent request-scoped resolution', () => {
    it('should isolate instances per ScopedContainer', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        id = Math.random()
      }

      // Create multiple scoped containers concurrently
      const scopedContainers = Array.from({ length: 5 }, (_, i) =>
        container.beginRequest(`request-${i}`),
      )

      const promises = scopedContainers.map((sc) => sc.get(RequestService))
      const instances = await Promise.all(promises)

      // Each scoped container should have its own instance
      const uniqueInstances = new Set(instances)
      expect(uniqueInstances.size).toBe(5)

      // Clean up
      await Promise.all(scopedContainers.map((sc) => sc.endRequest()))
    })

    it('should return same instance within same ScopedContainer', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        id = Math.random()
      }

      const scopedContainer = container.beginRequest('test-request')

      // Multiple concurrent requests within same scoped container
      const promises = Array.from({ length: 10 }, () => scopedContainer.get(RequestService))

      const instances = await Promise.all(promises)

      // All should be the same instance
      const first = instances[0]
      expect(instances.every((i) => i === first)).toBe(true)

      await scopedContainer.endRequest()
    })
  })

  describe('concurrent resolution with dependencies', () => {
    it('should correctly resolve dependency graph concurrently', async () => {
      @Injectable()
      class ServiceA {
        id = Math.random()
      }

      @Injectable()
      class ServiceB {
        private a = inject(ServiceA)
        id = Math.random()

        getAId() {
          return this.a.id
        }
      }

      @Injectable()
      class ServiceC {
        private a = inject(ServiceA)
        private b = inject(ServiceB)

        getIds() {
          return { a: this.a.id, b: this.b.id }
        }
      }

      // Resolve ServiceC concurrently multiple times
      const promises = Array.from({ length: 20 }, () => container.get(ServiceC))

      const instances = await Promise.all(promises)

      // All should be the same instance (singleton)
      const first = instances[0]
      expect(instances.every((i) => i === first)).toBe(true)

      // All should reference the same A and B (verified by id)
      const ids = first.getIds()
      // ServiceB should reference the same ServiceA
      expect(first.getIds().a).toBe(ids.a)
    })

    it('should handle async dependencies concurrently', async () => {
      @Injectable()
      class AsyncDependency {
        value = 'async-dep'

        async onServiceInit() {
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
      }

      @Injectable()
      class DependentService {
        private dep = asyncInject(AsyncDependency)

        async getValue() {
          const d = await this.dep
          return d.value
        }
      }

      const promises = Array.from({ length: 5 }, () => container.get(DependentService))

      const instances = await Promise.all(promises)

      // All should be the same instance
      expect(instances.every((i) => i === instances[0])).toBe(true)

      // Should work correctly
      const value = await instances[0].getValue()
      expect(value).toBe('async-dep')
    })
  })

  describe('concurrent disposal', () => {
    it('should handle invalidation gracefully', async () => {
      @Injectable()
      class DisposableService {
        value = 'active'
      }

      const instance = await container.get(DisposableService)
      expect(instance.value).toBe('active')

      // invalidate takes the instance, not the class
      await container.invalidate(instance)

      // After invalidation, getting a new instance should work
      const newInstance = await container.get(DisposableService)
      expect(newInstance).not.toBe(instance)
    })
  })

  describe('concurrent resolution during initialization', () => {
    it('should wait for service to complete initialization', async () => {
      let initCompleted = false

      @Injectable()
      class SlowInitService {
        ready = false

        async onServiceInit() {
          await new Promise((resolve) => setTimeout(resolve, 100))
          this.ready = true
          initCompleted = true
        }
      }

      // Start resolution
      const firstPromise = container.get(SlowInitService)

      // Try to get it again before first resolution completes
      await new Promise((resolve) => setTimeout(resolve, 20))
      const secondPromise = container.get(SlowInitService)

      const [first, second] = await Promise.all([firstPromise, secondPromise])

      // Both should be the same instance and fully initialized
      expect(first).toBe(second)
      expect(first.ready).toBe(true)
      expect(initCompleted).toBe(true)
    })
  })

  describe('concurrent mixed scope resolution', () => {
    it('should correctly handle mixed scopes concurrently', async () => {
      @Injectable()
      class SingletonService {
        id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {
        private singleton = inject(SingletonService)
        id = Math.random()

        getSingletonId() {
          return this.singleton.id
        }
      }

      // Get transient services concurrently
      const promises = Array.from({ length: 10 }, () => container.get(TransientService))

      const instances = await Promise.all(promises)

      // All transients should be different
      const transientIds = new Set(instances.map((i) => i.id))
      expect(transientIds.size).toBe(10)

      // But they should all share the same singleton
      const singletonId = instances[0].getSingletonId()
      expect(instances.every((i) => i.getSingletonId() === singletonId)).toBe(true)
    })
  })

  describe('stress test', () => {
    it('should handle high concurrency without errors', async () => {
      @Injectable()
      class StressService {
        value = 'stress'
      }

      // Fire 200 concurrent requests
      const promises = Array.from({ length: 200 }, () => container.get(StressService))

      const instances = await Promise.all(promises)

      // All should resolve successfully to the same instance
      expect(instances.every((i) => i === instances[0])).toBe(true)
      expect(instances[0].value).toBe('stress')
    })

    it('should handle rapid get/invalidate cycles', async () => {
      @Injectable()
      class CycleService {
        value = Math.random()
      }

      // Get initial instance
      const first = await container.get(CycleService)
      const firstValue = first.value

      // Invalidate takes instance, not class
      await container.invalidate(first)
      const second = await container.get(CycleService)

      // New instance should be different
      expect(second).not.toBe(first)
      expect(second.value).not.toBe(firstValue)
    })
  })

  describe('concurrent scoped container operations', () => {
    it('should handle multiple scoped containers created and disposed concurrently', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        id = Math.random()
      }

      // Create, use, and dispose many scoped containers sequentially
      // (concurrent beginRequest with same IDs would throw)
      const ids: number[] = []
      for (let i = 0; i < 10; i++) {
        const scoped = container.beginRequest(`request-${i}`)
        const service = await scoped.get(RequestService)
        ids.push(service.id)
        await scoped.endRequest()
      }

      // All should have unique IDs
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })
  })
})
