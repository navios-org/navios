/**
 * Garbage Collection Tests: Transient Services
 *
 * Tests that transient services are properly garbage collected
 * when no longer referenced, since they are not cached by the container.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.mjs'
import { InjectableScope } from '../../injectable-scope.mjs'
import { inject } from '../../internal/inject-impl.mjs'

import type { OnServiceDestroy } from '../../lifecycle-hooks.mjs'

import { countAlive, createGCTracker, forceGC, memoryInUse, waitForGC } from './gc-test-utils.mjs'

describe('GC: Transient Services', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Transient services are collected when unreferenced', () => {
    it('should garbage collect transient service when reference is released', async () => {
      @Injectable({ scope: InjectableScope.Transient })
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
      @Injectable({ scope: InjectableScope.Transient })
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
      @Injectable({ scope: InjectableScope.Transient })
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

      // Note: onServiceDestroy is NOT called for transient services resolved
      // directly from the root container: the container doesn't track them.
    })
  })

  describe('Transient services with dependencies', () => {
    it('should collect transient service but keep singleton dependency', async () => {
      @Injectable()
      class SingletonDep {
        public readonly id = Math.random()
      }

      @Injectable({ scope: InjectableScope.Transient })
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
      @Injectable({ scope: InjectableScope.Transient })
      class TransientDep {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 500 }, () => 'dep')
      }

      @Injectable({ scope: InjectableScope.Transient })
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
    it('should collect transient instances when they are released', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class LargeTransientService {
        public readonly data = new Uint8Array(1024 * 100) // 100KB
      }

      // In a function of its own: the frame of the test would hold the last one.
      const create = async () => {
        const instances: LargeTransientService[] = []
        for (let i = 0; i < 10; i++) {
          instances.push(await container.get(LargeTransientService))
        }
        return instances.map((instance) => new WeakRef(instance))
      }

      expect(await countAlive(await create())).toBe(0)
    })

    it('should not accumulate memory with repeated transient creations', async () => {
      const ALLOCATION_SIZE = 1024 * 50 // 50KB per instance
      const ITERATIONS = 50

      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {
        public readonly data = new Uint8Array(ALLOCATION_SIZE)
      }

      const baselineMemory = await memoryInUse()

      // Repeatedly create and discard transient instances
      for (let i = 0; i < ITERATIONS; i++) {
        const instance = await container.get(TransientService)
        // instance goes out of scope immediately
        void instance
      }

      const finalMemory = await memoryInUse()
      const memoryGrowth = finalMemory - baselineMemory

      // Memory growth should be minimal (less than 2 instances worth)
      // since transients are not cached
      expect(memoryGrowth).toBeLessThan(ALLOCATION_SIZE * 2)
    })
  })

  describe('Transient services in mixed scope scenarios', () => {
    it('should properly collect transients while singletons persist', async () => {
      @Injectable()
      class SingletonA {
        public readonly data = Array.from({ length: 500 }, () => 'singleton-a')
      }

      @Injectable()
      class SingletonB {
        public readonly data = Array.from({ length: 500 }, () => 'singleton-b')
      }

      @Injectable({ scope: InjectableScope.Transient })
      class TransientA {
        public readonly singletonA = inject(SingletonA)
        public readonly data = Array.from({ length: 500 }, () => 'transient-a')
      }

      @Injectable({ scope: InjectableScope.Transient })
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
