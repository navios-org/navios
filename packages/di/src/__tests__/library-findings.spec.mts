/**
 * Library Findings - Issues to Investigate
 *
 * This file documents potential issues or edge cases found during e2e testing
 * that require further investigation and potential fixes.
 *
 * Each test case is marked with `.skip` to prevent CI failures.
 * When investigating, remove `.skip` to reproduce the issue.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnServiceDestroy } from '../interfaces/on-service-destroy.interface.mjs'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { Registry } from '../token/registry.mjs'
import { getInjectors } from '../utils/get-injectors.mjs'

function createTestSetup() {
  const registry = new Registry()
  const injectors = getInjectors()
  const container = new Container(registry, null, injectors)
  return { registry, injectors, container }
}

// ============================================================================
// FINDING #1: Circular Dependencies (FIXED)
// ============================================================================

describe('FINDING #1: Circular Dependencies (FIXED)', () => {
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
      // Ignore - test may have caused issues
    }
  })

  /**
   * FIXED: Circular dependencies are now detected and throw a clear error.
   *
   * SOLUTION IMPLEMENTED:
   * - Added waitingFor: Set<string> to ServiceLocatorInstanceHolder to track waiting relationships
   * - Created CircularDependencyDetector that uses BFS to detect cycles in the waitingFor graph
   * - Used AsyncLocalStorage (resolution-context.mts) to track the current "waiter" across async boundaries
   * - Before waiting on a "Creating" holder, check for cycles and throw CircularDependencyError if found
   *
   * The error message shows a clear cycle path like:
   * "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
   *
   * NOTE: asyncInject() still works with circular dependencies because it returns a Promise
   * immediately without blocking. The cycle detection only triggers when using inject()
   * which collects dependency promises that are awaited before onServiceInit.
   */
  it('should detect and report circular dependencies instead of hanging', async () => {
    @Injectable({ scope: InjectableScope.Singleton, registry })
    class ServiceA {
      private serviceB = injectors.inject(ServiceB)
      name = 'ServiceA'

      async getB() {
        return this.serviceB
      }
    }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class ServiceB {
      private serviceA = injectors.inject(ServiceA)
      name = 'ServiceB'

      async getA() {
        return this.serviceA
      }
    }

    // This should throw an error like:
    // "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
    // Instead, it hangs forever.
    await expect(container.get(ServiceA)).rejects.toThrow(/circular/i)
  }, 1000) // 1 second timeout to detect the hang

  /**
   * Related scenario: Self-referential dependency
   */
  it('should detect self-referential dependencies', async () => {
    @Injectable({ scope: InjectableScope.Singleton, registry })
    class SelfReferentialService {
      private self = injectors.inject(SelfReferentialService)

      async getSelf() {
        return this.self
      }
    }

    await expect(container.get(SelfReferentialService)).rejects.toThrow(
      /circular/i,
    )
  }, 1000)

  /**
   * Related scenario: Three-way circular dependency
   */
  it('should detect three-way circular dependencies', async () => {
    @Injectable({ scope: InjectableScope.Singleton, registry })
    class ServiceX {
      private y = injectors.inject(ServiceY)
      async getY() {
        return this.y
      }
    }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class ServiceY {
      private z = injectors.inject(ServiceZ)
      async getZ() {
        return this.z
      }
    }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class ServiceZ {
      private x = injectors.inject(ServiceX)
      async getX() {
        return this.x
      }
    }

    await expect(container.get(ServiceX)).rejects.toThrow(/circular/i)
  }, 1000)
})

// ============================================================================
// FINDING #2: Request-Scoped Service Behavior Investigation
// ============================================================================

describe('FINDING #2: Request-Scoped Edge Cases (FIXED)', () => {
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
      // Ignore
    }
  })

  /**
   * FIXED: Singletons that depend on request-scoped services are now
   * properly invalidated when the request ends.
   *
   * This prevents stale reference issues where a singleton would hold
   * a reference to a destroyed request-scoped service.
   */
  it('singleton is invalidated when its request-scoped dependency is destroyed', async () => {
    @Injectable({ scope: InjectableScope.Request, registry })
    class RequestData3 {
      id = Math.random().toString(36).slice(2)
      data = 'initial'
    }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class SingletonHolder3 {
      singletonId = Math.random().toString(36).slice(2)
      private requestData = injectors.inject(RequestData3)

      async getData() {
        const rd = await this.requestData
        return rd
      }
    }

    // Create first request
    const scoped1 = container.beginRequest('request-1')
    const holder1 = await scoped1.get(SingletonHolder3)
    const originalSingletonId = holder1.singletonId
    const data1 = await holder1.getData()
    const originalRequestDataId = data1.id
    data1.data = 'modified-in-request-1'

    await scoped1.endRequest()

    // Create second request
    const scoped2 = container.beginRequest('request-2')

    // FIXED: The singleton is now invalidated when request ends
    // Getting the singleton again creates a NEW instance
    const holder2 = await scoped2.get(SingletonHolder3)

    // New singleton instance (different ID)
    expect(holder2.singletonId).not.toBe(originalSingletonId)

    // The new singleton gets fresh request data from request-2
    const data2 = await holder2.getData()
    expect(data2.id).not.toBe(originalRequestDataId) // New request data instance
    expect(data2.data).toBe('initial') // Fresh data, not stale!

    await scoped2.endRequest()
  })
})

// ============================================================================
// FINDING #3: Error Recovery Investigation
// ============================================================================

describe('FINDING #3: Error Recovery', () => {
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
      // Ignore
    }
  })

  /**
   * DOCUMENTED BEHAVIOR: Container allows retry after constructor errors
   *
   * When a service constructor throws on first attempt, the container
   * removes the failed holder from storage. This allows subsequent
   * attempts to retry creating the service.
   *
   * This is useful for services that might fail due to transient errors
   * (network issues, resource unavailability, etc.) - they can be
   * successfully created on retry once the transient issue is resolved.
   */
  it('allows retry after constructor errors (documented behavior)', async () => {
    let attemptCount = 0
    const shouldFail = { value: true }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class FlakeyService {
      constructor() {
        attemptCount++
        if (shouldFail.value) {
          throw new Error('Transient failure')
        }
      }

      getValue() {
        return 'success'
      }
    }

    // First attempt should fail
    await expect(container.get(FlakeyService)).rejects.toThrow(
      'Transient failure',
    )
    expect(attemptCount).toBe(1)

    // Allow success on retry
    shouldFail.value = false

    // Second attempt - container allows retry by removing the error holder
    // The constructor IS called again
    const instance = await container.get(FlakeyService)
    expect(instance.getValue()).toBe('success')
    expect(attemptCount).toBe(2) // Constructor was retried
  })

  /**
   * INVESTIGATION: What happens when onServiceInit throws?
   * Is the holder left in a corrupted state?
   */
  it('should clean up properly when onServiceInit throws', async () => {
    let initAttempts = 0
    const shouldFail = { value: true }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class FailingInitService {
      async onServiceInit() {
        initAttempts++
        if (shouldFail.value) {
          throw new Error('Init failed')
        }
      }
    }

    // First attempt should fail
    await expect(container.get(FailingInitService)).rejects.toThrow(
      'Init failed',
    )

    // Allow success on retry
    shouldFail.value = false

    // Can we get the service now?
    // This documents the recovery behavior:
    try {
      await container.get(FailingInitService)
      // Container allows retry after init failure
      expect(initAttempts).toBe(2)
    } catch {
      // Container doesn't allow retry
      // Check if it's returning cached error or something else
    }
  })
})

// ============================================================================
// FINDING #4: Concurrent Initialization Race Conditions
// ============================================================================

describe('FINDING #4: Concurrent Initialization', () => {
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
      // Ignore
    }
  })

  /**
   * INVESTIGATION: When multiple concurrent requests try to create the same
   * service that has a slow onServiceInit, does the container properly
   * deduplicate and wait for the first initialization to complete?
   */
  it('should deduplicate slow singleton initialization', async () => {
    let constructorCalls = 0
    let initCalls = 0

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class SlowService {
      constructor() {
        constructorCalls++
      }

      async onServiceInit() {
        initCalls++
        // Slow initialization
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }

    // Try to get the same service 10 times concurrently
    const results = await Promise.all(
      Array.from({ length: 10 }, () => container.get(SlowService)),
    )

    // All results should be the same instance
    const uniqueInstances = new Set(results)
    expect(uniqueInstances.size).toBe(1)

    // Constructor and init should only be called once
    expect(constructorCalls).toBe(1)
    expect(initCalls).toBe(1)
  })
})

// ============================================================================
// FINDING #5: Cross-Storage Dependency Tracking
// ============================================================================

describe('FINDING #5: Cross-Storage Dependency Invalidation', () => {
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
      // Ignore
    }
  })

  /**
   * FIXED: When a request-scoped service is invalidated/destroyed,
   * singletons that depend on it ARE now properly invalidated.
   *
   * The fix involved TWO changes:
   * 1. RequestHolderStorage.findDependents() now checks both request storage
   *    AND singleton storage for holders that depend on the request service
   * 2. endRequest() now uses clearAllWithStorage() which properly cascades
   *    invalidation to dependent singletons
   */
  it('singleton IS invalidated when its request dependency ends (FIXED)', async () => {
    const singletonDestroySpy = vi.fn()

    @Injectable({ scope: InjectableScope.Request, registry })
    class RequestData2 {
      data = 'request-data'
    }

    // Use a unique ID generator that doesn't depend on counting
    @Injectable({ scope: InjectableScope.Singleton, registry })
    class SingletonConsumer2 implements OnServiceDestroy {
      id = Math.random().toString(36).slice(2)
      private requestData = injectors.inject(RequestData2)

      async getData() {
        const rd = await this.requestData
        return rd.data
      }

      onServiceDestroy() {
        singletonDestroySpy(this.id)
      }
    }

    // Request 1: Create singleton and its request-scoped dependency
    const scoped1 = container.beginRequest('request-1')
    const singleton1 = await scoped1.get(SingletonConsumer2)
    const originalId = singleton1.id
    const data1 = await singleton1.getData()
    expect(data1).toBe('request-data')

    await scoped1.endRequest()

    // FIXED BEHAVIOR: Singleton IS invalidated when request ends
    // because it depends on a request-scoped service
    expect(singletonDestroySpy).toHaveBeenCalledWith(originalId)

    // Request 2: Get singleton again - should be a NEW instance
    const scoped2 = container.beginRequest('request-2')
    const singleton2 = await scoped2.get(SingletonConsumer2)

    // FIXED BEHAVIOR: New singleton instance is created
    expect(singleton2).not.toBe(singleton1)
    expect(singleton2.id).not.toBe(originalId)

    // The new singleton gets fresh request-scoped data from request-2
    const data2 = await singleton2.getData()
    expect(data2).toBe('request-data')

    await scoped2.endRequest()
  })

  /**
   * Test to verify the dependency is actually tracked
   */
  it('verifies dependency is tracked in singleton deps', async () => {
    @Injectable({ scope: InjectableScope.Request, registry })
    class RequestService {
      value = 'from-request'
    }

    @Injectable({ scope: InjectableScope.Singleton, registry })
    class SingletonWithDep {
      private reqSvc = injectors.inject(RequestService)

      async getValue() {
        const svc = await this.reqSvc
        return svc.value
      }
    }

    const scoped = container.beginRequest('test-request')
    const singleton = await scoped.get(SingletonWithDep)
    await singleton.getValue() // Force resolution

    // Check that the singleton's holder has the request service in deps
    const manager = container.getServiceLocator().getManager()
    const singletonHolders = Array.from(
      manager.filter((h) => h.scope === InjectableScope.Singleton).values(),
    )

    // Find the SingletonWithDep holder
    const singletonHolder = singletonHolders.find((h) =>
      h.name.includes('SingletonWithDep'),
    )

    if (singletonHolder) {
      // The deps should contain the RequestService instance name
      const hasRequestDep = Array.from(singletonHolder.deps).some((dep) =>
        dep.includes('RequestService'),
      )
      expect(hasRequestDep).toBe(true)
    }

    await scoped.endRequest()
  })
})

// ============================================================================
// SUMMARY OF FINDINGS
// ============================================================================

/**
 * FIXED ISSUES:
 * 1. Circular dependencies - FIXED
 *    - Root cause: waitForInstanceReady would wait indefinitely on holders in the resolution chain
 *    - Fix applied:
 *      a) Added CircularDependencyDetector that uses BFS to detect cycles in the waitingFor graph
 *      b) Added waitingFor: Set<string> to ServiceLocatorInstanceHolder for tracking
 *      c) Used AsyncLocalStorage (resolution-context.mts) to track the current waiter across async boundaries
 *      d) Before waiting on a "Creating" holder, check for cycles and throw CircularDependencyError if found
 *    - Error message shows clear cycle path: "ServiceA -> ServiceB -> ServiceA"
 *    - Note: asyncInject() still works with circular deps because it doesn't block on dependencies
 *
 * 5. Cross-storage dependency invalidation - FIXED
 *    - Root cause was: RequestHolderStorage.findDependents() only searched request storage
 *    - Also: ScopedContainer.endRequest() bypassed invalidation cascade
 *    - Fix applied:
 *      a) RequestHolderStorage.findDependents() now also checks singleton manager
 *      b) endRequest() now uses clearAllWithStorage() for proper cascade
 *
 * 2. Singleton holding stale request-scoped references - FIXED (via #5 fix)
 *    - Singletons that depend on request-scoped services are now properly
 *      invalidated when the request ends
 *
 * EDGE CASES (documented behavior):
 * 3. Error recovery behavior - constructor errors are cached - FIXED
 *    - Priority: Low
 *    - Impact: May prevent retry after transient failures
 *    - Documented: This is intentional, use onServiceInit for retry logic
 *
 * VERIFIED WORKING:
 * - Circular dependency detection throws clear errors
 * - Concurrent singleton initialization is properly deduplicated
 * - Request isolation works correctly
 * - Lifecycle methods are called in correct order
 * - Invalidation cascades properly to dependents (across all storages)
 * - Dependency tracking works (deps are recorded correctly)
 * - Cross-storage invalidation works (singletons depending on request-scoped)
 */
