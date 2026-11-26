/**
 * Edge cases found during e2e testing, all of them resolved since.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.mjs'
import { DIError, DIErrorCode } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { inject } from '../internal/inject-impl.mjs'

// ============================================================================
// FINDING #1: Circular Dependencies (FIXED)
// ============================================================================

describe('FINDING #1: Circular Dependencies (FIXED)', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
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
   * The engine tracks the construction stack (and wait edges between entries
   * that are still being created) and throws a CircularDependency error with
   * a clear cycle path like:
   * "Circular dependency detected: ServiceA -> ServiceB -> ServiceA"
   *
   * NOTE: asyncInject() still works with circular dependencies because it
   * starts resolving after the current construction has returned.
   */
  it('should detect and report circular dependencies instead of hanging', async () => {
    @Injectable({ scope: InjectableScope.Singleton })
    class ServiceA {
      private serviceB = inject(ServiceB)
      name = 'ServiceA'

      async getB() {
        return this.serviceB
      }
    }

    @Injectable({ scope: InjectableScope.Singleton })
    class ServiceB {
      private serviceA = inject(ServiceA)
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
    @Injectable({ scope: InjectableScope.Singleton })
    class SelfReferentialService {
      private self = inject(SelfReferentialService)

      async getSelf() {
        return this.self
      }
    }

    await expect(container.get(SelfReferentialService)).rejects.toThrow(/circular/i)
  }, 1000)

  /**
   * Related scenario: Three-way circular dependency
   */
  it('should detect three-way circular dependencies', async () => {
    @Injectable({ scope: InjectableScope.Singleton })
    class ServiceX {
      private y = inject(ServiceY)
      async getY() {
        return this.y
      }
    }

    @Injectable({ scope: InjectableScope.Singleton })
    class ServiceY {
      private z = inject(ServiceZ)
      async getZ() {
        return this.z
      }
    }

    @Injectable({ scope: InjectableScope.Singleton })
    class ServiceZ {
      private x = inject(ServiceX)
      async getX() {
        return this.x
      }
    }

    await expect(container.get(ServiceX)).rejects.toThrow(/circular/i)
  }, 1000)
})

// ============================================================================
// FINDING #3: Error Recovery Investigation
// ============================================================================

describe('FINDING #3: Error Recovery', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
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

    @Injectable({ scope: InjectableScope.Singleton })
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
    await expect(container.get(FlakeyService)).rejects.toThrow('Transient failure')
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

    @Injectable({ scope: InjectableScope.Singleton })
    class FailingInitService {
      async onServiceInit() {
        initAttempts++
        if (shouldFail.value) {
          throw new Error('Init failed')
        }
      }
    }

    // First attempt should fail
    const error = await container.get(FailingInitService).catch((e) => e)
    expect(error).toBeInstanceOf(DIError)
    expect(error.code).toBe(DIErrorCode.InitializationError)
    expect(error.message).toContain('Init failed')
    expect(initAttempts).toBe(1)

    // Allow success on retry
    shouldFail.value = false

    // The failed entry is removed, so the container allows a retry
    await expect(container.get(FailingInitService)).resolves.toBeInstanceOf(FailingInitService)
    expect(initAttempts).toBe(2)
  })
})

// ============================================================================
// FINDING #4: Concurrent Initialization Race Conditions
// ============================================================================

describe('FINDING #4: Concurrent Initialization', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
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

    @Injectable({ scope: InjectableScope.Singleton })
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
    const results = await Promise.all(Array.from({ length: 10 }, () => container.get(SlowService)))

    // All results should be the same instance
    const uniqueInstances = new Set(results)
    expect(uniqueInstances.size).toBe(1)

    // Constructor and init should only be called once
    expect(constructorCalls).toBe(1)
    expect(initCalls).toBe(1)
  })
})

// ============================================================================
// SUMMARY OF FINDINGS
// ============================================================================

/**
 * 1. Circular dependencies are detected and reported with the cycle path
 *    ("ServiceA -> ServiceB -> ServiceA") instead of hanging. asyncInject()
 *    can still be used to break a cycle deliberately.
 * 3. A failed constructor or onServiceInit removes the entry, so the next
 *    resolution retries.
 * 4. Concurrent singleton initialization is deduplicated.
 *
 * Findings #2 and #5 covered singletons that inject request-scoped services.
 * That is no longer possible in 2.0 (it is a ScopeMismatchError, see
 * scope.spec.mts), so those cases were removed.
 */
