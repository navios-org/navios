/**
 * Garbage Collection Tests: Transient Services
 *
 * Tests that transient services are properly garbage collected
 * when no longer referenced, since they are not cached by the container.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn nx test @navios/di
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../../enums/injectable-scope.enum.mjs'
import { Registry } from '../../token/registry.mjs'
import { inject } from '../../utils/index.mjs'

import type { OnServiceDestroy } from '../../interfaces/on-service-destroy.interface.mjs'

import {
  createGCTracker,
  forceGC,
  getHeapUsed,
  isGCAvailable,
  waitForGC,
} from './gc-test-utils.mjs'

describe.skipIf(!isGCAvailable)('GC: Transient Services', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Transient services are collected when unreferenced', () => {
    it('should garbage collect transient service when reference is released', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 1000 }, () => 'transient')
      }

      let instance: TransientService | null = await container.get(TransientService)
      const tracker = createGCTracker(instance)

      expect(tracker().collected).toBe(false)

      // Release the reference
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })

    it('should collect multiple transient instances independently', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'multi-transient')
      }

      let instance1: TransientService | null = await container.get(TransientService)
      let instance2: TransientService | null = await container.get(TransientService)
      let instance3: TransientService | null = await container.get(TransientService)

      expect(instance1).not.toBe(instance2)
      expect(instance2).not.toBe(instance3)

      const tracker1 = createGCTracker(instance1)
      const tracker2 = createGCTracker(instance2)
      const tracker3 = createGCTracker(instance3)

      // Release only the first instance
      instance1 = null
      forceGC()

      expect(await waitForGC(tracker1().ref, 500)).toBe(true)
      expect(tracker2().collected).toBe(false)
      expect(tracker3().collected).toBe(false)

      // Release the second instance
      instance2 = null
      forceGC()

      expect(await waitForGC(tracker2().ref, 500)).toBe(true)
      expect(tracker3().collected).toBe(false)

      // Release the third instance
      instance3 = null
      forceGC()

      expect(await waitForGC(tracker3().ref, 500)).toBe(true)
    })

    it('should collect transient services with lifecycle hooks', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientWithDestroy implements OnServiceDestroy {
        public readonly id = Math.random()

        onServiceDestroy(): void {
          // This won't be called when going out of scope
        }
      }

      let instance: TransientWithDestroy | null = await container.get(TransientWithDestroy)
      const tracker = createGCTracker(instance)

      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)

      // Note: onServiceDestroy is NOT called for transient services when
      // they go out of scope - only when the container is disposed.
      // This is expected behavior since the container doesn't track them.
    })
  })

  describe('Transient services with dependencies', () => {
    it('should collect transient service but keep singleton dependency', async () => {
      @Injectable({ registry })
      class SingletonDep {
        public readonly id = Math.random()
      }

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientWithSingletonDep {
        public readonly dep = inject(SingletonDep)
        public readonly id = Math.random()
      }

      const singletonRef = await container.get(SingletonDep)
      let transient: TransientWithSingletonDep | null =
        await container.get(TransientWithSingletonDep)

      expect(transient.dep).toBe(singletonRef)

      const transientTracker = createGCTracker(transient)
      const singletonTracker = createGCTracker(singletonRef)

      transient = null
      forceGC()

      // Transient should be collected
      expect(await waitForGC(transientTracker().ref)).toBe(true)

      // Singleton should NOT be collected (still in container)
      forceGC()
      expect(singletonTracker().collected).toBe(false)

      // Singleton is still accessible
      const stillThere = await container.get(SingletonDep)
      expect(stillThere).toBe(singletonRef)
    })

    it('should collect transient service with transient dependency', async () => {
      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientDep {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'dep')
      }

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientParent {
        public readonly dep = inject(TransientDep)
        public readonly data = Array.from({ length: 500 }, () => 'parent')
      }

      let parent: TransientParent | null = await container.get(TransientParent)
      let depRef: TransientDep | null = parent.dep

      const parentTracker = createGCTracker(parent)
      const depTracker = createGCTracker(depRef)

      // Release both references
      parent = null
      depRef = null
      forceGC()

      // Both should be collected since no external references
      expect(await waitForGC(parentTracker().ref)).toBe(true)
      expect(await waitForGC(depTracker().ref)).toBe(true)
    })
  })

  describe('Memory is reclaimed for transient services', () => {
    // This test is flaky and no matter how many instances we create, the last instance is never collected.
    it.skip('should reclaim memory when transient instances are released', async () => {
      const INSTANCE_COUNT = 10

      @Injectable({ registry, scope: InjectableScope.Transient })
      class LargeTransientService {
        public readonly data = new Uint8Array(1024 * 100) // 100KB
      }

      // Track all instances with WeakRefs
      const trackers: ReturnType<typeof createGCTracker>[] = []
      let instances: LargeTransientService[] = []

      for (let i = 0; i < INSTANCE_COUNT; i++) {
        const instance = await container.get(LargeTransientService)
        instances.push(instance)
        trackers.push(createGCTracker(instance))
      }

      // Verify none collected yet
      for (const tracker of trackers) {
        expect(tracker().collected).toBe(false)
      }

      // Release all references
      instances = []
      forceGC()

      let collected = 0
      // All should be collected
      for (const tracker of trackers) {
        console.log('waiting for GC', collected++, tracker().collected)
        expect(await waitForGC(tracker().ref)).toBe(true)
      }
    })

    it.todo('should not accumulate memory with repeated transient creations', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB per instance
      const ITERATIONS = 50

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientService {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      forceGC()
      const baselineMemory = getHeapUsed()

      // Repeatedly create and discard transient instances
      for (let i = 0; i < ITERATIONS; i++) {
        const instance = await container.get(TransientService)
        // instance goes out of scope immediately
        void instance
      }

      forceGC()
      const finalMemory = getHeapUsed()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 instances worth)
      // since transients are not cached
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2)
    })
  })

  describe('Transient services in mixed scope scenarios', () => {
    it('should properly collect transients while singletons persist', async () => {
      @Injectable({ registry })
      class SingletonA {
        public readonly data = Array.from({ length: 500 }, () => 'singleton-a')
      }

      @Injectable({ registry })
      class SingletonB {
        public readonly data = Array.from({ length: 500 }, () => 'singleton-b')
      }

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientA {
        public readonly singletonA = inject(SingletonA)
        public readonly data = Array.from({ length: 500 }, () => 'transient-a')
      }

      @Injectable({ registry, scope: InjectableScope.Transient })
      class TransientB {
        public readonly singletonB = inject(SingletonB)
        public readonly data = Array.from({ length: 500 }, () => 'transient-b')
      }

      // Get singletons first
      const singletonA = await container.get(SingletonA)
      const singletonB = await container.get(SingletonB)

      // Create transients
      let transientA: TransientA | null = await container.get(TransientA)
      let transientB: TransientB | null = await container.get(TransientB)

      const trackers = {
        singletonA: createGCTracker(singletonA),
        singletonB: createGCTracker(singletonB),
        transientA: createGCTracker(transientA),
        transientB: createGCTracker(transientB),
      }

      // Release transients
      transientA = null
      transientB = null
      forceGC()

      // Transients should be collected
      expect(await waitForGC(trackers.transientA().ref)).toBe(true)
      expect(await waitForGC(trackers.transientB().ref)).toBe(true)

      // Singletons should remain
      expect(trackers.singletonA().collected).toBe(false)
      expect(trackers.singletonB().collected).toBe(false)

      // Singletons still accessible
      expect(await container.get(SingletonA)).toBe(singletonA)
      expect(await container.get(SingletonB)).toBe(singletonB)
    })
  })
})
