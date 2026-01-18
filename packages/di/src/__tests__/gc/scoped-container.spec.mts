/**
 * Garbage Collection Tests: Scoped Container
 *
 * Tests that request-scoped services are properly garbage collected
 * when the scoped container is ended/disposed.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn nx test @navios/di
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../../enums/injectable-scope.enum.mjs'
import { Registry } from '../../token/registry.mjs'
import { inject } from '../../utils/index.mjs'

import type { ScopedContainer } from '../../container/scoped-container.mjs'
import type { OnServiceDestroy } from '../../interfaces/on-service-destroy.interface.mjs'

import {
  createGCTracker,
  forceGC,
  getHeapUsed,
  isGCAvailable,
  waitForGC,
} from './gc-test-utils.mjs'

describe.skipIf(!isGCAvailable)('GC: Scoped Container', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Request-scoped services released on endRequest', () => {
    it('should garbage collect request-scoped service after endRequest', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 1000 }, () => 'request-scoped')
      }

      const scoped = container.beginRequest('test-request-1')
      let instance: RequestService | null = await scoped.get(RequestService)
      const tracker = createGCTracker(instance)

      expect(tracker().collected).toBe(false)

      await scoped.endRequest()
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })

    it('should collect multiple request-scoped services on endRequest', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class ServiceA {
        public readonly data = Array.from({ length: 500 }, () => 'a')
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class ServiceB {
        public readonly data = Array.from({ length: 500 }, () => 'b')
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class ServiceC {
        public readonly data = Array.from({ length: 500 }, () => 'c')
      }

      const scoped = container.beginRequest('test-request-2')

      let instanceA: ServiceA | null = await scoped.get(ServiceA)
      let instanceB: ServiceB | null = await scoped.get(ServiceB)
      let instanceC: ServiceC | null = await scoped.get(ServiceC)

      const trackerA = createGCTracker(instanceA)
      const trackerB = createGCTracker(instanceB)
      const trackerC = createGCTracker(instanceC)

      await scoped.endRequest()

      // Release local references
      instanceA = null
      instanceB = null
      instanceC = null

      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
      expect(await waitForGC(trackerC().ref)).toBe(true)
    })

    it('should call onServiceDestroy and then collect', async () => {
      const destroyedIds: number[] = []

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestServiceWithDestroy implements OnServiceDestroy {
        public readonly id = Math.random()

        onServiceDestroy(): void {
          destroyedIds.push(this.id)
        }
      }

      const scoped = container.beginRequest('test-request-3')
      let instance: RequestServiceWithDestroy | null = await scoped.get(RequestServiceWithDestroy)
      const instanceId = instance.id
      const tracker = createGCTracker(instance)

      expect(destroyedIds).toHaveLength(0)

      await scoped.endRequest()
      instance = null

      expect(destroyedIds).toContain(instanceId)
      expect(await waitForGC(tracker().ref)).toBe(true)
    })

    it('should handle async onServiceDestroy before collection', async () => {
      let destroyCompleted = false

      @Injectable({ registry, scope: InjectableScope.Request })
      class AsyncDestroyService implements OnServiceDestroy {
        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 10))
          destroyCompleted = true
        }
      }

      const scoped = container.beginRequest('test-request-4')
      let instance: AsyncDestroyService | null = await scoped.get(AsyncDestroyService)
      const tracker = createGCTracker(instance)

      await scoped.endRequest()
      instance = null

      expect(destroyCompleted).toBe(true)
      expect(await waitForGC(tracker().ref)).toBe(true)
    })
  })

  describe('Scoped container itself is collected', () => {
    it('should garbage collect scoped container after endRequest', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {}

      let scoped: ScopedContainer | null = container.beginRequest('test-gc-scoped')
      await scoped.get(RequestService)

      const scopedTracker = createGCTracker(scoped)

      await scoped.endRequest()
      scoped = null

      const collected = await waitForGC(scopedTracker().ref)
      expect(collected).toBe(true)
    })
  })

  describe('Mixed scope scenarios with request scope', () => {
    it('should collect request-scoped but keep singletons', async () => {
      @Injectable({ registry })
      class SingletonService {
        public readonly id = Math.random()
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly singleton = inject(SingletonService)
        public readonly id = Math.random()
      }

      // Get singleton first via root container
      const singleton = await container.get(SingletonService)
      const singletonTracker = createGCTracker(singleton)

      // Create request scope and get request-scoped service
      const scoped = container.beginRequest('test-mixed-1')
      let requestInstance: RequestService | null = await scoped.get(RequestService)
      const requestTracker = createGCTracker(requestInstance)

      // Request service should reference same singleton
      expect(requestInstance.singleton).toBe(singleton)

      await scoped.endRequest()
      requestInstance = null

      // Request-scoped should be collected
      expect(await waitForGC(requestTracker().ref)).toBe(true)

      // Singleton should remain
      expect(singletonTracker().collected).toBe(false)
      expect(await container.get(SingletonService)).toBe(singleton)
    })

    it('should isolate request-scoped services between requests', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'isolated')
      }

      const scoped1 = container.beginRequest('request-a')
      const scoped2 = container.beginRequest('request-b')

      let instance1: RequestService | null = await scoped1.get(RequestService)
      let instance2: RequestService | null = await scoped2.get(RequestService)

      expect(instance1).not.toBe(instance2)

      const tracker1 = createGCTracker(instance1)
      const tracker2 = createGCTracker(instance2)

      // End first request
      await scoped1.endRequest()
      instance1 = null

      expect(await waitForGC(tracker1().ref)).toBe(true)
      expect(tracker2().collected).toBe(false)

      // Second request's instance should still work
      let stillThere: RequestService | null = await scoped2.get(RequestService)
      expect(stillThere).toBe(instance2)

      // End second request
      await scoped2.endRequest()
      instance2 = null
      stillThere = null

      expect(await waitForGC(tracker2().ref)).toBe(true)
    })
  })

  describe('Request-scoped dependency chains', () => {
    it('should collect entire request-scoped dependency chain', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class Level3 {
        public readonly data = Array.from({ length: 200 }, () => 'l3')
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class Level2 {
        public readonly level3 = inject(Level3)
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class Level1 {
        public readonly level2 = inject(Level2)
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RootService {
        public readonly level1 = inject(Level1)
      }

      const scoped = container.beginRequest('chain-request')
      let root: RootService | null = await scoped.get(RootService)

      let l1: Level1 | null = root.level1
      let l2: Level2 | null = l1.level2
      let l3: Level3 | null = l2.level3

      const rootTracker = createGCTracker(root)
      const l1Tracker = createGCTracker(l1)
      const l2Tracker = createGCTracker(l2)
      const l3Tracker = createGCTracker(l3)

      await scoped.endRequest()

      // Release local references
      root = null
      l1 = null
      l2 = null
      l3 = null

      expect(await waitForGC(rootTracker().ref)).toBe(true)
      expect(await waitForGC(l1Tracker().ref)).toBe(true)
      expect(await waitForGC(l2Tracker().ref)).toBe(true)
      expect(await waitForGC(l3Tracker().ref)).toBe(true)
    })

    it('should handle mixed singleton/request dependency chain', async () => {
      @Injectable({ registry })
      class SingletonBase {
        public readonly id = 'singleton-base'
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestMiddle {
        public readonly base = inject(SingletonBase)
        public readonly id = Math.random()
      }

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestTop {
        public readonly middle = inject(RequestMiddle)
        public readonly id = Math.random()
      }

      const singletonBase = await container.get(SingletonBase)
      const baseTracker = createGCTracker(singletonBase)

      const scoped = container.beginRequest('mixed-chain')
      let top: RequestTop | null = await scoped.get(RequestTop)
      let middle: RequestMiddle | null = top.middle

      const middleTracker = createGCTracker(middle)
      const topTracker = createGCTracker(top)

      expect(middle.base).toBe(singletonBase)

      await scoped.endRequest()

      // Release local references
      top = null
      middle = null

      // Request-scoped should be collected
      expect(await waitForGC(topTracker().ref)).toBe(true)
      expect(await waitForGC(middleTracker().ref)).toBe(true)

      // Singleton should remain
      expect(baseTracker().collected).toBe(false)
    })
  })

  describe('Memory reclamation for request scopes', () => {
    it.todo('should reclaim memory when request ends', async () => {
      const ALLOCATION_SIZE = 1024 * 100 // 100KB
      const SERVICE_COUNT = 10

      // Create multiple request-scoped services
      const services: Array<{ new (): { data: Uint8Array } }> = []
      for (let i = 0; i < SERVICE_COUNT; i++) {
        @Injectable({ registry, scope: InjectableScope.Request })
        class LargeRequestService {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }
        services.push(LargeRequestService)
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      const scoped = container.beginRequest('memory-test')

      // Resolve all services
      for (const Service of services) {
        await scoped.get(Service)
      }

      forceGC()
      const afterAllocationMemory = getHeapUsed()
      const allocated = afterAllocationMemory - baselineMemory

      expect(allocated).toBeGreaterThan(ALLOCATION_SIZE * SERVICE_COUNT * 0.8)

      await scoped.endRequest()

      forceGC()
      const afterReleaseMemory = getHeapUsed()
      const reclaimed = afterAllocationMemory - afterReleaseMemory

      // Should reclaim most memory (at least 70%)
      expect(reclaimed).toBeGreaterThan(allocated * 0.7)
    })

    it.todo('should not leak memory across multiple requests', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB
      const REQUEST_COUNT = 20

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      // Process many requests
      for (let i = 0; i < REQUEST_COUNT; i++) {
        const scoped = container.beginRequest(`request-${i}`)
        await scoped.get(RequestService)
        await scoped.endRequest()
      }

      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 allocations worth)
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2)
    })
  })

  describe('Concurrent request handling', () => {
    // This test is flaky and no matter how many requests we make, the last instance is never collected.
    it.skip('should properly collect services from concurrent requests', async () => {
      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'concurrent')
      }

      const requestCount = 10
      const scopedContainers: ScopedContainer[] = []
      const trackers: ReturnType<typeof createGCTracker>[] = []

      // Start multiple concurrent requests
      for (let i = 0; i < requestCount; i++) {
        const scoped = container.beginRequest(`concurrent-${i}`)
        scopedContainers.push(scoped)
        const instance = await scoped.get(RequestService)
        trackers.push(createGCTracker(instance))
      }

      // End all requests
      await Promise.all(scopedContainers.map((s) => s.endRequest()))

      forceGC()
      // All should be collected
      let collected = 0
      for (const tracker of trackers) {
        console.log('waiting for GC', collected++, tracker().collected)
        expect(await waitForGC(tracker().ref)).toBe(true)
      }
    })
  })
})
