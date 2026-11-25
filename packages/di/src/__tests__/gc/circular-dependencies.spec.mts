/**
 * Garbage Collection Tests: Circular Dependencies
 *
 * Tests that services with circular dependencies (resolved via asyncInject)
 * are properly garbage collected without memory leaks.
 *
 * Note: Direct circular dependencies throw CircularDependencyError.
 * Use asyncInject() to handle circular dependencies correctly.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn run -T vitest run src/__tests__/gc
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.mjs'
import { InjectionToken } from '../../index.mjs'
import { InjectableScope } from '../../injectable-scope.mjs'
import { asyncInject } from '../../injection/injectors.mjs'

import type { OnServiceDestroy } from '../../lifecycle-hooks.mjs'

import {
  createGCTracker,
  forceGC,
  getHeapUsed,
  isGCAvailable,
  waitForGC,
} from './gc-test-utils.mjs'

describe.skipIf(!isGCAvailable)('GC: Circular Dependencies', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Two-way circular dependencies with asyncInject', () => {
    it('should garbage collect mutually dependent services after disposal', async () => {
      @Injectable()
      class ServiceA {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'a')
        private serviceBPromise = asyncInject(ServiceB)

        async getServiceB(): Promise<ServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable()
      class ServiceB {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'b')
        private serviceAPromise = asyncInject(ServiceA)

        async getServiceA(): Promise<ServiceA> {
          return this.serviceAPromise
        }
      }

      let serviceA: ServiceA | null = await container.get(ServiceA)
      let serviceB: ServiceB | null = await container.get(ServiceB)

      // Verify circular references are established
      expect(await serviceA.getServiceB()).toBe(serviceB)
      expect(await serviceB.getServiceA()).toBe(serviceA)

      const trackerA = createGCTracker(serviceA)
      const trackerB = createGCTracker(serviceB)

      await container.dispose()

      container = new Container()

      // Release local references
      serviceA = null
      serviceB = null

      // Both should be collected despite circular references
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })
    it('should collect circular services when invalidated', async () => {
      @Injectable()
      class ServiceA {
        public readonly id = Math.random()
        private _serviceBPromise = asyncInject(ServiceB)
      }

      @Injectable()
      class ServiceB {
        public readonly id = Math.random()
        private _serviceAPromise = asyncInject(ServiceA)
      }

      let serviceA1: ServiceA | null = await container.get(ServiceA)
      let serviceB1: ServiceB | null = await container.get(ServiceB)

      const trackerA1 = createGCTracker(serviceA1)
      const trackerB1 = createGCTracker(serviceB1)

      const id1A = serviceA1.id
      const id1B = serviceB1.id

      // Invalidate using instance, not class
      await container.invalidate(serviceA1)

      // Release local references
      serviceA1 = null
      serviceB1 = null
      forceGC()

      // Get new instances
      const serviceA2 = await container.get(ServiceA)
      const serviceB2 = await container.get(ServiceB)

      // Old instances should be different
      expect(serviceA2.id).not.toBe(id1A)
      expect(serviceB2.id).not.toBe(id1B)

      // Old instances should be collected
      expect(await waitForGC(trackerA1().ref)).toBe(true)
      expect(await waitForGC(trackerB1().ref)).toBe(true)
    })
  })

  describe('Three-way circular dependencies', () => {
    it('should garbage collect triangular dependency cycle', async () => {
      @Injectable()
      class ServiceA {
        public readonly id = 'A'
        public readonly data = Array.from({ length: 300 }, () => 'a')
        private serviceBPromise = asyncInject(ServiceB)

        async getB(): Promise<ServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable()
      class ServiceB {
        public readonly id = 'B'
        public readonly data = Array.from({ length: 300 }, () => 'b')
        private serviceCPromise = asyncInject(ServiceC)

        async getC(): Promise<ServiceC> {
          return this.serviceCPromise
        }
      }

      @Injectable()
      class ServiceC {
        public readonly id = 'C'
        public readonly data = Array.from({ length: 300 }, () => 'c')
        private serviceAPromise = asyncInject(ServiceA)

        async getA(): Promise<ServiceA> {
          return this.serviceAPromise
        }
      }

      let a: ServiceA | null = await container.get(ServiceA)
      let b: ServiceB | null = await container.get(ServiceB)
      let c: ServiceC | null = await container.get(ServiceC)

      // Verify the cycle: A -> B -> C -> A
      expect(await a.getB()).toBe(b)
      expect(await b.getC()).toBe(c)
      expect(await c.getA()).toBe(a)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)
      const trackerC = createGCTracker(c)

      await container.dispose()

      container = new Container()

      // Release local references
      a = null
      b = null
      c = null

      // All three should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
      expect(await waitForGC(trackerC().ref)).toBe(true)
    })
  })

  describe('Circular dependencies with lifecycle hooks', () => {
    it('should call onServiceDestroy for all circular services', async () => {
      const destroyOrder: string[] = []

      @Injectable()
      class ServiceA implements OnServiceDestroy {
        public readonly id = 'A'
        private _serviceBPromise = asyncInject(ServiceB)

        onServiceDestroy(): void {
          destroyOrder.push('A')
        }
      }

      @Injectable()
      class ServiceB implements OnServiceDestroy {
        public readonly id = 'B'
        private _serviceAPromise = asyncInject(ServiceA)

        onServiceDestroy(): void {
          destroyOrder.push('B')
        }
      }

      let a: ServiceA | null = await container.get(ServiceA)
      let b: ServiceB | null = await container.get(ServiceB)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await container.dispose()

      // Both destroy hooks should be called
      expect(destroyOrder).toContain('A')
      expect(destroyOrder).toContain('B')

      container = new Container()

      // Release local references
      a = null
      b = null

      // Both should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })

    it('should handle async onServiceDestroy in circular services', async () => {
      const destroyCompleted: string[] = []

      @Injectable()
      class ServiceA implements OnServiceDestroy {
        private _serviceBPromise = asyncInject(ServiceB)

        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 5))
          destroyCompleted.push('A')
        }
      }

      @Injectable()
      class ServiceB implements OnServiceDestroy {
        private _serviceAPromise = asyncInject(ServiceA)

        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 5))
          destroyCompleted.push('B')
        }
      }

      let a: ServiceA | null = await container.get(ServiceA)
      let b: ServiceB | null = await container.get(ServiceB)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await container.dispose()

      expect(destroyCompleted).toContain('A')
      expect(destroyCompleted).toContain('B')

      container = new Container()

      // Release local references
      a = null
      b = null

      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })
  })

  describe('Circular dependencies in request scope', () => {
    it('should collect request-scoped circular services on endRequest', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestServiceA {
        public readonly id = Math.random()
        private serviceBPromise = asyncInject(RequestServiceB)

        async getB(): Promise<RequestServiceB> {
          return this.serviceBPromise
        }
      }

      @Injectable({ scope: InjectableScope.Request })
      class RequestServiceB {
        public readonly id = Math.random()
        private serviceAPromise = asyncInject(RequestServiceA)

        async getA(): Promise<RequestServiceA> {
          return this.serviceAPromise
        }
      }

      const scoped = container.createScope()

      let a: RequestServiceA | null = await scoped.get(RequestServiceA)
      let b: RequestServiceB | null = await scoped.get(RequestServiceB)

      // Verify circular reference
      expect(await a.getB()).toBe(b)
      expect(await b.getA()).toBe(a)

      const trackerA = createGCTracker(a)
      const trackerB = createGCTracker(b)

      await scoped.dispose()

      // Release local references
      a = null
      b = null

      // Both should be collected
      expect(await waitForGC(trackerA().ref)).toBe(true)
      expect(await waitForGC(trackerB().ref)).toBe(true)
    })
  })

  describe('Memory reclamation with circular dependencies', () => {
    it('should not leak memory with repeated circular service creation', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB
      const ITERATIONS = 10

      forceGC()
      const baselineMemory = getHeapUsed()

      for (let i = 0; i < ITERATIONS; i++) {
        const localContainer = new Container()

        @Injectable()
        class ServiceA {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          private _serviceBPromise = asyncInject(ServiceB)
        }

        @Injectable()
        class ServiceB {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          private _serviceAPromise = asyncInject(ServiceA)
        }

        await localContainer.get(ServiceA)
        await localContainer.get(ServiceB)

        await localContainer.dispose()
      }

      // Let the microtask queue drain so that settled promise chains are
      // collectable before measuring
      await new Promise((resolve) => setTimeout(resolve, 0))
      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 iteration's allocations)
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2 * 2)
    })

    // This test is Kinda working, but it's not very reliable and V8 optimizations can make it fail.
    it.skip('should reclaim all memory from complex circular graph', async () => {
      const ALLOCATION_SIZE = 1024 * 20 // 20KB
      const NODE_COUNT = 5

      // Create a fully connected circular graph
      let services: Array<{ new (): object }> = []

      for (let i = 0; i < NODE_COUNT; i++) {
        const token = InjectionToken.create<GraphNode>(`GraphNode${i}`)
        @Injectable({ token })
        class GraphNode implements OnServiceDestroy {
          public readonly nodeId = i
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          // Each node references all others via asyncInject
          private _deps = services
            .filter((S) => S !== GraphNode)
            .map((S) => asyncInject(S).catch(() => null))

          onServiceDestroy(): void {
            // Clear the promises array to allow garbage collection
            // Resolved promises hold references to their resolved values,
            // so we need to clear them explicitly
            this._deps.length = 0
          }
        }
        services.push(GraphNode)
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      // Resolve all services
      let instances: object[] = await Promise.all(services.map((S) => container.get(S)))

      forceGC()
      // Get the memory after the services are allocated
      const afterAllocationMemory = getHeapUsed()
      const allocated = afterAllocationMemory - baselineMemory
      expect(allocated).toBeGreaterThan(ALLOCATION_SIZE * NODE_COUNT * 0.5)

      let trackers = instances.map((inst) => createGCTracker(inst))

      await container.dispose()

      container = new Container()

      // Release local references
      instances = []
      // services = []

      // All nodes should be collected
      for (const tracker of trackers) {
        expect(await waitForGC(tracker().ref)).toBe(true)
      }
      // Clear the trackers array to allow garbage collection
      trackers = []
      // Force GC again to ensure everything is collected
      forceGC()

      const afterReleaseMemory = getHeapUsed()
      const reclaimed = afterAllocationMemory - afterReleaseMemory

      console.log('baselineMemory', baselineMemory)
      console.log('reclaimed', reclaimed)
      console.log('allocated', allocated)
      console.log('afterAllocationMemory', afterAllocationMemory)
      console.log('afterReleaseMemory', afterReleaseMemory)
      // Should reclaim most memory
      expect(reclaimed).toBeGreaterThan(allocated * 0.7)
    })
  })
})
