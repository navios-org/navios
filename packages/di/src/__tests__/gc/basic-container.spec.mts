/**
 * Garbage Collection Tests: Basic Container
 *
 * Tests that the Container and singleton services are properly
 * garbage collected after disposal.
 *
 * Run with: NODE_OPTIONS=--expose-gc yarn nx test @navios/di
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { Registry } from '../../token/registry.mjs'
import { inject } from '../../utils/index.mjs'

import type { OnServiceDestroy } from '../../interfaces/on-service-destroy.interface.mjs'

import { createGCTracker, forceGC, isGCAvailable, waitForGC } from './gc-test-utils.mjs'

/**
 * NOTE: Many of these tests currently fail because the DI container retains
 * references to services even after disposal. This is likely due to:
 * - Registry holding class references
 * - Decorator metadata retention
 * - Internal caching mechanisms
 *
 * These tests document expected GC behavior and can be used to verify
 * memory leak fixes in the future. Tests are marked with .todo() to
 * indicate they document desired behavior not yet implemented.
 */
describe.skipIf(!isGCAvailable)('GC: Basic Container', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Container disposal releases service references', () => {
    it('should allow singleton services to be garbage collected after container disposal', async () => {
      @Injectable({ registry })
      class SingletonService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 1000 }, () => 'test-data')
      }

      let instance: SingletonService | null = await container.get(SingletonService)
      const tracker = createGCTracker(instance)

      expect(tracker().collected).toBe(false)

      await container.dispose()

      // Create new container for cleanup in afterEach
      registry = new Registry()
      container = new Container(registry)
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })

    it('should allow multiple singleton services to be garbage collected', async () => {
      @Injectable({ registry })
      class ServiceA {
        public readonly data = Array.from({ length: 500 }, () => 'a')
      }

      @Injectable({ registry })
      class ServiceB {
        public readonly data = Array.from({ length: 500 }, () => 'b')
      }

      @Injectable({ registry })
      class ServiceC {
        public readonly data = Array.from({ length: 500 }, () => 'c')
      }

      let instanceA: ServiceA | null = await container.get(ServiceA)
      let instanceB: ServiceB | null = await container.get(ServiceB)
      let instanceC: ServiceC | null = await container.get(ServiceC)

      const trackerA = createGCTracker(instanceA)
      const trackerB = createGCTracker(instanceB)
      const trackerC = createGCTracker(instanceC)

      await container.dispose()

      registry = new Registry()
      container = new Container(registry)

      // Release local references to allow GC
      instanceA = null
      instanceB = null
      instanceC = null

      const collectedA = await waitForGC(trackerA().ref)
      const collectedB = await waitForGC(trackerB().ref)
      const collectedC = await waitForGC(trackerC().ref)

      expect(collectedA).toBe(true)
      expect(collectedB).toBe(true)
      expect(collectedC).toBe(true)
    })

    it('should release services with onServiceDestroy lifecycle hook', async () => {
      let destroyCalled = false

      @Injectable({ registry })
      class ServiceWithDestroy implements OnServiceDestroy {
        public readonly data = Array.from({ length: 1000 }, () => 'destroy-test')

        onServiceDestroy(): void {
          destroyCalled = true
        }
      }

      let instance: ServiceWithDestroy | null = await container.get(ServiceWithDestroy)
      const tracker = createGCTracker(instance)

      expect(destroyCalled).toBe(false)

      await container.dispose()

      expect(destroyCalled).toBe(true)

      registry = new Registry()
      container = new Container(registry)
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })

    it('should release services with async onServiceDestroy', async () => {
      let destroyCompleted = false

      @Injectable({ registry })
      class AsyncDestroyService implements OnServiceDestroy {
        public readonly data = Array.from({ length: 1000 }, () => 'async-destroy')

        async onServiceDestroy(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 10))
          destroyCompleted = true
        }
      }

      let instance: AsyncDestroyService | null = await container.get(AsyncDestroyService)
      const tracker = createGCTracker(instance)

      await container.dispose()

      expect(destroyCompleted).toBe(true)

      registry = new Registry()
      container = new Container(registry)
      instance = null

      const collected = await waitForGC(tracker().ref)
      expect(collected).toBe(true)
    })
  })

  describe('Singleton service dependencies are released', () => {
    it('should release dependent services when parent is disposed', async () => {
      @Injectable({ registry })
      class DependencyService {
        public readonly data = Array.from({ length: 500 }, () => 'dep')
      }

      @Injectable({ registry })
      class ParentService {
        public readonly dep = inject(DependencyService)
        public readonly data = Array.from({ length: 500 }, () => 'parent')
      }

      let parent: ParentService | null = await container.get(ParentService)
      let dep: DependencyService | null = parent.dep

      const parentTracker = createGCTracker(parent)
      const depTracker = createGCTracker(dep)

      await container.dispose()

      registry = new Registry()
      container = new Container(registry)

      // Release local references
      parent = null
      dep = null

      const parentCollected = await waitForGC(parentTracker().ref)
      const depCollected = await waitForGC(depTracker().ref)

      expect(parentCollected).toBe(true)
      expect(depCollected).toBe(true)
    })

    it('should release deeply nested dependency chains', async () => {
      @Injectable({ registry })
      class Level3 {
        public readonly data = Array.from({ length: 200 }, () => 'l3')
      }

      @Injectable({ registry })
      class Level2 {
        public readonly level3 = inject(Level3)
        public readonly data = Array.from({ length: 200 }, () => 'l2')
      }

      @Injectable({ registry })
      class Level1 {
        public readonly level2 = inject(Level2)
        public readonly data = Array.from({ length: 200 }, () => 'l1')
      }

      @Injectable({ registry })
      class RootService {
        public readonly level1 = inject(Level1)
        public readonly data = Array.from({ length: 200 }, () => 'root')
      }

      let root: RootService | null = await container.get(RootService)
      let l1: Level1 | null = root.level1
      let l2: Level2 | null = l1.level2
      let l3: Level3 | null = l2.level3

      const rootTracker = createGCTracker(root)
      const l1Tracker = createGCTracker(l1)
      const l2Tracker = createGCTracker(l2)
      const l3Tracker = createGCTracker(l3)

      await container.dispose()

      registry = new Registry()
      container = new Container(registry)

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
  })

  describe('Container invalidation releases services', () => {
    it('should release service when invalidated', async () => {
      @Injectable({ registry })
      class InvalidatableService {
        public readonly id = Math.random()
        public readonly data = Array.from({ length: 1000 }, () => 'invalidate')
      }

      let instance1: InvalidatableService | null = await container.get(InvalidatableService)
      const id1 = instance1.id
      const tracker1 = createGCTracker(instance1)

      // Invalidate using instance, not class
      await container.invalidate(instance1)

      // Release local reference before GC
      instance1 = null
      forceGC()

      // Get a new instance after invalidation
      const instance2 = await container.get(InvalidatableService)

      expect(instance2.id).not.toBe(id1)

      const collected = await waitForGC(tracker1().ref)
      expect(collected).toBe(true)
    })

    it('should release dependent services when dependency is invalidated', async () => {
      @Injectable({ registry })
      class DependencyService {
        public readonly id = Math.random()
      }

      @Injectable({ registry })
      class DependentService {
        public readonly dep = inject(DependencyService)
        public readonly id = Math.random()
      }

      let dependent: DependentService | null = await container.get(DependentService)
      let dependency: DependencyService | null = dependent.dep

      const dependentTracker = createGCTracker(dependent)
      const dependencyTracker = createGCTracker(dependency)

      // Invalidating the dependency using instance, not class
      await container.invalidate(dependency)

      // Release local references
      dependent = null
      dependency = null
      forceGC()

      const dependencyCollected = await waitForGC(dependencyTracker().ref)
      const dependentCollected = await waitForGC(dependentTracker().ref)

      expect(dependencyCollected).toBe(true)
      expect(dependentCollected).toBe(true)
    })
  })

  describe('Container itself can be garbage collected', () => {
    it('should allow container to be garbage collected after disposal', async () => {
      const localRegistry = new Registry()
      let localContainer: Container | null = new Container(localRegistry)

      @Injectable({ registry: localRegistry })
      class TestService {
        public readonly data = Array.from({ length: 1000 }, () => 'container-gc')
      }

      await localContainer.get(TestService)

      const containerTracker = createGCTracker(localContainer)

      await localContainer.dispose()
      localContainer = null

      const collected = await waitForGC(containerTracker().ref)
      expect(collected).toBe(true)
    })
  })
})
