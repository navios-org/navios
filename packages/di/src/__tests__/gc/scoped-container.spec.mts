/**
 * Garbage Collection Tests: Scoped Container
 *
 * Tests that request-scoped services are properly garbage collected
 * when the scoped container is ended/disposed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.mjs'
import { InjectableScope } from '../../injectable-scope.mjs'
import { asyncInject, inject } from '../../internal/inject-impl.mjs'

import type { ScopedContainer } from '../../container/scoped-container.mjs'
import type { OnServiceDestroy } from '../../lifecycle-hooks.mjs'

import { countAlive, createGCTracker, memoryInUse, waitForGC } from './gc-test-utils.mjs'

describe('GC: Scoped Container', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Request-scoped services released on disposal', () => {
    it('should garbage collect request-scoped service after disposal', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 1000 }, () => 'request-scoped')
      }

      const scoped = container.createScope()
      let instance: RequestService | null = await scoped.get(RequestService)
      const tracker = createGCTracker(instance)

      expect(tracker().collected).toBe(false)

      await scoped.dispose()
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })

    it('should collect multiple request-scoped services on disposal', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class ServiceA {
        public readonly data = Array.from({ length: 500 }, () => 'a')
      }

      @Injectable({ scope: InjectableScope.Request })
      class ServiceB {
        public readonly data = Array.from({ length: 500 }, () => 'b')
      }

      @Injectable({ scope: InjectableScope.Request })
      class ServiceC {
        public readonly data = Array.from({ length: 500 }, () => 'c')
      }

      const scoped = container.createScope()

      let instanceA: ServiceA | null = await scoped.get(ServiceA)
      let instanceB: ServiceB | null = await scoped.get(ServiceB)
      let instanceC: ServiceC | null = await scoped.get(ServiceC)

      const trackerA = createGCTracker(instanceA)
      const trackerB = createGCTracker(instanceB)
      const trackerC = createGCTracker(instanceC)

      await scoped.dispose()

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

      @Injectable({ scope: InjectableScope.Request })
      class RequestServiceWithDestroy implements OnServiceDestroy {
        public readonly id = Math.random()

        onServiceDestroy(): void {
          destroyedIds.push(this.id)
        }
      }

      const scoped = container.createScope()
      let instance: RequestServiceWithDestroy | null = await scoped.get(RequestServiceWithDestroy)
      const instanceId = instance.id
      const tracker = createGCTracker(instance)

      expect(destroyedIds).toHaveLength(0)

      await scoped.dispose()
      instance = null

      expect(destroyedIds).toContain(instanceId)
      expect(await waitForGC(tracker().ref)).toBe(true)
    })

    it('should handle async onServiceDestroy before collection', async () => {
      let destroyCompleted = false

      @Injectable({ scope: InjectableScope.Request })
      class AsyncDestroyService implements OnServiceDestroy {
        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 10))
          destroyCompleted = true
        }
      }

      const scoped = container.createScope()
      let instance: AsyncDestroyService | null = await scoped.get(AsyncDestroyService)
      const tracker = createGCTracker(instance)

      await scoped.dispose()
      instance = null

      expect(destroyCompleted).toBe(true)
      expect(await waitForGC(tracker().ref)).toBe(true)
    })
  })

  describe('Scoped container itself is collected', () => {
    it('should garbage collect scoped container after disposal', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {}

      let scoped: ScopedContainer | null = container.createScope()
      await scoped.get(RequestService)

      const scopedTracker = createGCTracker(scoped)

      await scoped.dispose()
      scoped = null

      const collected = await waitForGC(scopedTracker().ref)
      expect(collected).toBe(true)
    })
  })

  describe('Mixed scope scenarios with request scope', () => {
    it('should collect request-scoped but keep singletons', async () => {
      @Injectable()
      class SingletonService {
        public readonly id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly singleton = inject(SingletonService)
        public readonly id = Math.random()
      }

      // Get singleton first via root container
      const singleton = await container.get(SingletonService)
      const singletonTracker = createGCTracker(singleton)

      // Create request scope and get request-scoped service
      const scoped = container.createScope()
      let requestInstance: RequestService | null = await scoped.get(RequestService)
      const requestTracker = createGCTracker(requestInstance)

      // Request service should reference same singleton
      expect(requestInstance.singleton).toBe(singleton)

      await scoped.dispose()
      requestInstance = null

      // Request-scoped should be collected
      expect(await waitForGC(requestTracker().ref)).toBe(true)

      // Singleton should remain
      expect(singletonTracker().collected).toBe(false)
      expect(await container.get(SingletonService)).toBe(singleton)
    })

    it('should isolate request-scoped services between requests', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'isolated')
      }

      const scoped1 = container.createScope()
      const scoped2 = container.createScope()

      let instance1: RequestService | null = await scoped1.get(RequestService)
      let instance2: RequestService | null = await scoped2.get(RequestService)

      expect(instance1).not.toBe(instance2)

      const tracker1 = createGCTracker(instance1)
      const tracker2 = createGCTracker(instance2)

      // End first request
      await scoped1.dispose()
      instance1 = null

      expect(await waitForGC(tracker1().ref)).toBe(true)
      expect(tracker2().collected).toBe(false)

      // Second request's instance should still work
      let stillThere: RequestService | null = await scoped2.get(RequestService)
      expect(stillThere).toBe(instance2)

      // End second request
      await scoped2.dispose()
      instance2 = null
      stillThere = null

      expect(await waitForGC(tracker2().ref)).toBe(true)
    })
  })

  describe('Request-scoped dependency chains', () => {
    it('should collect entire request-scoped dependency chain', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Level3 {
        public readonly data = Array.from({ length: 200 }, () => 'l3')
      }

      @Injectable({ scope: InjectableScope.Request })
      class Level2 {
        public readonly level3 = inject(Level3)
      }

      @Injectable({ scope: InjectableScope.Request })
      class Level1 {
        public readonly level2 = inject(Level2)
      }

      @Injectable({ scope: InjectableScope.Request })
      class RootService {
        public readonly level1 = inject(Level1)
      }

      const scoped = container.createScope()
      let root: RootService | null = await scoped.get(RootService)

      let l1: Level1 | null = root.level1
      let l2: Level2 | null = l1.level2
      let l3: Level3 | null = l2.level3

      const rootTracker = createGCTracker(root)
      const l1Tracker = createGCTracker(l1)
      const l2Tracker = createGCTracker(l2)
      const l3Tracker = createGCTracker(l3)

      await scoped.dispose()

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
      @Injectable()
      class SingletonBase {
        public readonly id = 'singleton-base'
      }

      @Injectable({ scope: InjectableScope.Request })
      class RequestMiddle {
        public readonly base = inject(SingletonBase)
        public readonly id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Request })
      class RequestTop {
        public readonly middle = inject(RequestMiddle)
        public readonly id = Math.random()
      }

      const singletonBase = await container.get(SingletonBase)
      const baseTracker = createGCTracker(singletonBase)

      const scoped = container.createScope()
      let top: RequestTop | null = await scoped.get(RequestTop)
      let middle: RequestMiddle | null = top.middle

      const middleTracker = createGCTracker(middle)
      const topTracker = createGCTracker(top)

      expect(middle.base).toBe(singletonBase)

      await scoped.dispose()

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
    it('should reclaim memory when request ends', async () => {
      const ALLOCATION_SIZE = 1024 * 100 // 100KB
      const SERVICE_COUNT = 10

      // Create multiple request-scoped services
      const services: Array<{ new (): { data: Uint8Array } }> = []
      for (let i = 0; i < SERVICE_COUNT; i++) {
        @Injectable({ scope: InjectableScope.Request })
        class LargeRequestService {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }
        services.push(LargeRequestService)
      }

      const baselineMemory = await memoryInUse()

      const scoped = container.createScope()

      // Resolve all services
      for (const Service of services) {
        await scoped.get(Service)
      }

      const afterAllocationMemory = await memoryInUse()
      const allocated = afterAllocationMemory - baselineMemory

      expect(allocated).toBeGreaterThan(ALLOCATION_SIZE * SERVICE_COUNT * 0.8)

      await scoped.dispose()

      const afterReleaseMemory = await memoryInUse()
      const reclaimed = afterAllocationMemory - afterReleaseMemory

      // Should reclaim most memory (at least 70%)
      expect(reclaimed).toBeGreaterThan(allocated * 0.7)
    })

    it('should not leak memory across multiple requests', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB
      const REQUEST_COUNT = 20

      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      const baselineMemory = await memoryInUse()

      // Process many requests
      for (let i = 0; i < REQUEST_COUNT; i++) {
        const scoped = container.createScope()
        await scoped.get(RequestService)
        await scoped.dispose()
      }

      const finalMemory = await memoryInUse()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 allocations worth)
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2)
    })
  })

  describe('Concurrent request handling', () => {
    it('should collect services from concurrent requests', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly data = Array.from({ length: 500 }, () => 'concurrent')
      }

      const handle = async () => {
        const scopes = Array.from({ length: 10 }, () => container.createScope())
        const refs = await Promise.all(
          scopes.map(async (scope) => new WeakRef(await scope.get(RequestService))),
        )
        await Promise.all(scopes.map((scope) => scope.dispose()))
        return refs
      }

      expect(await countAlive(await handle())).toBe(0)
    })
  })

  describe('A singleton first built in a request', () => {
    it('should not keep the request alive through an asyncInject() promise', async () => {
      @Injectable()
      class Dependency {}

      @Injectable()
      class Single {
        readonly dependency = asyncInject(Dependency)
      }

      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        readonly single = inject(Single)
      }

      const handle = async () => {
        const scope = container.createScope()
        const handler = await scope.get(Handler)
        await handler.single.dependency
        await scope.dispose()
        return [new WeakRef<object>(scope), new WeakRef<object>(handler)]
      }

      expect(await countAlive(await handle())).toBe(0)
      expect(container.peek(Single)).not.toBeNull()
    })
  })
})
