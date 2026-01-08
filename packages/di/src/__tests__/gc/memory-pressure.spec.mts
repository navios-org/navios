/**
 * Garbage Collection Tests: Memory Pressure
 *
 * Tests that verify the DI container properly handles memory under pressure
 * and doesn't leak memory over time. These tests use process.memoryUsage()
 * to measure actual heap usage.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn nx test @navios/di
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { OnServiceDestroy } from '../../interfaces/on-service-destroy.interface.mjs'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../../enums/injectable-scope.enum.mjs'
import { InjectionToken } from '../../index.mjs'
import { Registry } from '../../token/registry.mjs'
import { inject } from '../../utils/index.mjs'
import {
  forceGC,
  getHeapUsed,
  getHeapUsedMB,
  isGCAvailable,
  measureMemoryDelta,
} from './gc-test-utils.mjs'

describe.skipIf(!isGCAvailable)('GC: Memory Pressure', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Container disposal memory reclamation', () => {
    it.todo(
      'should reclaim memory when container with many singletons is disposed',
      async () => {
        const SERVICE_COUNT = 50
        const ALLOCATION_SIZE = 1024 * 100 // 100KB per service

        // Create many singleton services
        const services: Array<{ new (): { data: Uint8Array } }> = []
        for (let i = 0; i < SERVICE_COUNT; i++) {
          @Injectable({ registry })
          class LargeService {
            public readonly data = new Uint8Array(ALLOCATION_SIZE)
          }
          services.push(LargeService)
        }

        forceGC()
        const beforeAllocation = getHeapUsed()

        // Resolve all services
        for (const Service of services) {
          await container.get(Service)
        }

        forceGC()
        const afterAllocation = getHeapUsed()
        const allocated = afterAllocation - beforeAllocation

        // Should have allocated approximately SERVICE_COUNT * ALLOCATION_SIZE
        const expectedAllocation = SERVICE_COUNT * ALLOCATION_SIZE
        expect(allocated).toBeGreaterThan(expectedAllocation * 0.8)

        // Dispose container
        await container.dispose()

        // Create new container for afterEach cleanup
        registry = new Registry()
        container = new Container(registry)

        forceGC()
        const afterDisposal = getHeapUsed()
        const reclaimed = afterAllocation - afterDisposal

        // Should reclaim at least 80% of allocated memory
        expect(reclaimed).toBeGreaterThan(allocated * 0.8)
      },
    )

    it.todo('should measure memory baseline and peak correctly', async () => {
      const ALLOCATION_SIZE = 1024 * 1024 // 1MB

      @Injectable({ registry })
      class LargeService {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      const { after, delta } = await measureMemoryDelta(async () => {
        await container.get(LargeService)
      })

      // Delta should be roughly the allocation size (with some overhead)
      expect(delta).toBeGreaterThan(ALLOCATION_SIZE * 0.8)
      expect(delta).toBeLessThan(ALLOCATION_SIZE * 1.5)

      // Cleanup and measure reclamation
      await container.dispose()
      registry = new Registry()
      container = new Container(registry)

      forceGC()
      const final = getHeapUsed()

      // Memory should return close to baseline
      const memoryReturn = after - final
      expect(memoryReturn).toBeGreaterThan(ALLOCATION_SIZE * 0.8)
    })
  })

  describe('Long-running container stress tests', () => {
    it('should not accumulate memory with repeated service invalidation', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB
      const ITERATIONS = 30

      @Injectable({ registry })
      class InvalidatableService implements OnServiceDestroy {
        public readonly id = Math.random()
        public readonly data = new Uint8Array(ALLOCATION_SIZE)

        onServiceDestroy(): void {
          // Cleanup
        }
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      // Repeatedly create and invalidate
      for (let i = 0; i < ITERATIONS; i++) {
        const instance = await container.get(InvalidatableService)
        await container.invalidate(instance)
      }

      // Get one final instance
      await container.get(InvalidatableService)

      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be roughly one service instance
      // (only the latest should remain)
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 3)
    })

    it('should handle many request lifecycles without leaking', async () => {
      const ALLOCATION_SIZE = 1024 * 20 // 20KB
      const REQUEST_COUNT = 50
      const SERVICES_PER_REQUEST = 5

      // Create request-scoped services
      const services: Array<{ new (): { data: Uint8Array } }> = []
      for (let i = 0; i < SERVICES_PER_REQUEST; i++) {
        const token = InjectionToken.create<RequestService>(
          `RequestService${i}`,
        )
        @Injectable({ registry, scope: InjectableScope.Request, token })
        class RequestService {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }
        services.push(RequestService)
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      // Simulate many request lifecycles
      for (let reqId = 0; reqId < REQUEST_COUNT; reqId++) {
        const scoped = container.beginRequest(`request-${reqId}`)

        // Resolve all services in this request
        for (const Service of services) {
          await scoped.get(Service)
        }

        await scoped.endRequest()

        // Periodically force GC to help cleanup
        if (reqId % 10 === 0) {
          forceGC()
        }
      }

      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal after all requests end
      const maxExpectedGrowth = ALLOCATION_SIZE * SERVICES_PER_REQUEST * 2
      expect(memoryGrowth).toBeLessThan(maxExpectedGrowth)
    })
  })

  describe('High memory allocation scenarios', () => {
    it.todo('should handle allocation spike and recovery', async () => {
      const SPIKE_SIZE = 1024 * 1024 * 10 // 10MB spike

      @Injectable({ registry })
      class SpikeService {
        public readonly data = new Uint8Array(SPIKE_SIZE)
      }

      forceGC()
      const beforeSpike = getHeapUsedMB()

      // Create spike
      await container.get(SpikeService)

      forceGC()
      const atSpike = getHeapUsedMB()
      const spikeDelta = atSpike - beforeSpike

      // Verify spike occurred
      expect(spikeDelta).toBeGreaterThan(8) // At least 8MB

      // Release spike
      await container.dispose()
      registry = new Registry()
      container = new Container(registry)

      forceGC()
      const afterRecovery = getHeapUsedMB()
      const recovered = atSpike - afterRecovery

      // Should recover most of the spike
      expect(recovered).toBeGreaterThan(spikeDelta * 0.8)
    })

    it.todo(
      'should handle multiple containers without cross-contamination',
      async () => {
        const ALLOCATION_SIZE = 1024 * 1024 // 1MB per container's services
        const CONTAINER_COUNT = 5

        forceGC()
        const baselineMemory = getHeapUsed()

        const containers: Array<{ container: Container; registry: Registry }> =
          []

        // Create multiple containers
        for (let i = 0; i < CONTAINER_COUNT; i++) {
          const localRegistry = new Registry()
          const localContainer = new Container(localRegistry)

          @Injectable({ registry: localRegistry })
          class ContainerService {
            public readonly containerId = i
            public readonly data = new Uint8Array(ALLOCATION_SIZE)
          }

          await localContainer.get(ContainerService)
          containers.push({
            container: localContainer,
            registry: localRegistry,
          })
        }

        forceGC()
        const peakMemory = getHeapUsed()
        const totalAllocated = peakMemory - baselineMemory

        // Should have allocated approximately CONTAINER_COUNT * ALLOCATION_SIZE
        expect(totalAllocated).toBeGreaterThan(
          ALLOCATION_SIZE * CONTAINER_COUNT * 0.8,
        )

        // Dispose containers one by one and verify memory reclamation
        for (let i = 0; i < CONTAINER_COUNT; i++) {
          await containers[i].container.dispose()
          forceGC()

          const currentMemory = getHeapUsed()
          const remainingContainers = CONTAINER_COUNT - (i + 1)
          const expectedMemory =
            baselineMemory + ALLOCATION_SIZE * remainingContainers

          // Memory should decrease as containers are disposed
          // Allow 50% tolerance for GC timing
          expect(currentMemory).toBeLessThan(expectedMemory * 1.5)
        }
      },
    )
  })

  describe('Memory fragmentation prevention', () => {
    it.todo(
      'should handle alternating allocations without fragmentation issues',
      async () => {
        const SMALL_SIZE = 1024 * 10 // 10KB
        const LARGE_SIZE = 1024 * 500 // 500KB
        const ITERATIONS = 20

        let smallServices: Array<{ new (): object }> = []
        let largeServices: Array<{ new (): object }> = []

        forceGC()
        const baselineMemory = getHeapUsed()

        // Alternate between small and large allocations
        for (let i = 0; i < ITERATIONS; i++) {
          @Injectable({ registry })
          class SmallService {
            public readonly data = new Uint8Array(SMALL_SIZE)
          }
          smallServices.push(SmallService)
          await container.get(SmallService)

          @Injectable({ registry })
          class LargeService {
            public readonly data = new Uint8Array(LARGE_SIZE)
          }
          largeServices.push(LargeService)
          await container.get(LargeService)
        }

        forceGC()
        const peakMemory = getHeapUsed()
        const allocated = peakMemory - baselineMemory

        // Dispose and verify reclamation
        await container.dispose()
        registry = new Registry()
        container = new Container(registry)

        // Clear references
        smallServices = []
        largeServices = []

        forceGC()
        const finalMemory = getHeapUsed()
        const reclaimed = peakMemory - finalMemory

        // Should reclaim at least 80% despite fragmentation potential
        expect(reclaimed).toBeGreaterThan(allocated * 0.8)
      },
    )
  })

  describe('Dependency chain memory', () => {
    it.todo('should properly reclaim deep dependency chains', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB per service

      // Build a static chain of 10 services
      @Injectable({ registry })
      class Level10 {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level9 {
        public readonly next = inject(Level10)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level8 {
        public readonly next = inject(Level9)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level7 {
        public readonly next = inject(Level8)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level6 {
        public readonly next = inject(Level7)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level5 {
        public readonly next = inject(Level6)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level4 {
        public readonly next = inject(Level5)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level3 {
        public readonly next = inject(Level4)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level2 {
        public readonly next = inject(Level3)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      @Injectable({ registry })
      class Level1 {
        public readonly next = inject(Level2)
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      const DEPTH = 10

      forceGC()
      const baselineMemory = getHeapUsed()

      // Resolve the top of the chain (causes entire chain to resolve)
      await container.get(Level1)

      forceGC()
      const peakMemory = getHeapUsed()
      const allocated = peakMemory - baselineMemory

      // Should have allocated approximately DEPTH * ALLOCATION_SIZE
      expect(allocated).toBeGreaterThan(DEPTH * ALLOCATION_SIZE * 0.8)

      // Dispose
      await container.dispose()
      registry = new Registry()
      container = new Container(registry)

      forceGC()
      const finalMemory = getHeapUsed()
      const reclaimed = peakMemory - finalMemory

      // Should reclaim entire chain
      expect(reclaimed).toBeGreaterThan(allocated * 0.8)
    })

    it.todo(
      'should handle diamond dependency pattern without memory duplication',
      async () => {
        const ALLOCATION_SIZE = 1024 * 100 // 100KB

        // Diamond pattern: A depends on B and C, both B and C depend on D
        @Injectable({ registry })
        class ServiceD {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }

        @Injectable({ registry })
        class ServiceB {
          public readonly d = inject(ServiceD)
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }

        @Injectable({ registry })
        class ServiceC {
          public readonly d = inject(ServiceD)
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }

        @Injectable({ registry })
        class ServiceA {
          public readonly b = inject(ServiceB)
          public readonly c = inject(ServiceC)
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
        }

        forceGC()
        const baselineMemory = getHeapUsed()

        const a = await container.get(ServiceA)

        // Verify diamond - B and C should share same D instance
        expect(a.b.d).toBe(a.c.d)

        forceGC()
        const peakMemory = getHeapUsed()
        const allocated = peakMemory - baselineMemory

        // Should be 4 services worth (not 5), since D is shared
        const expectedMax = 4 * ALLOCATION_SIZE * 1.3 // 30% overhead tolerance
        expect(allocated).toBeLessThan(expectedMax)

        // Dispose and verify reclamation
        await container.dispose()
        registry = new Registry()
        container = new Container(registry)

        forceGC()
        const finalMemory = getHeapUsed()
        const reclaimed = peakMemory - finalMemory

        expect(reclaimed).toBeGreaterThan(allocated * 0.8)
      },
    )
  })

  describe('Concurrent resolution memory', () => {
    it.todo(
      'should not duplicate memory with concurrent resolutions of same service',
      async () => {
        const ALLOCATION_SIZE = 1024 * 500 // 500KB
        const CONCURRENT_REQUESTS = 10

        @Injectable({ registry })
        class ExpensiveService {
          public readonly data = new Uint8Array(ALLOCATION_SIZE)
          public readonly createdAt = Date.now()
        }

        forceGC()
        const baselineMemory = getHeapUsed()

        // Request same singleton concurrently
        const instances = await Promise.all(
          Array.from({ length: CONCURRENT_REQUESTS }, () =>
            container.get(ExpensiveService),
          ),
        )

        // All should be same instance
        const first = instances[0]
        for (const instance of instances) {
          expect(instance).toBe(first)
        }

        forceGC()
        const peakMemory = getHeapUsed()
        const allocated = peakMemory - baselineMemory

        // Should only have allocated once, not CONCURRENT_REQUESTS times
        const maxExpected = ALLOCATION_SIZE * 1.5 // Allow 50% overhead
        expect(allocated).toBeLessThan(maxExpected)
      },
    )
  })
})
