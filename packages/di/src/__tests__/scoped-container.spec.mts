/**
 * Comprehensive tests for ScopedContainer
 *
 * These tests cover:
 * 1. Basic ScopedContainer functionality
 * 2. Request-scoped service resolution
 * 3. addInstance method with various token types
 * 4. Error handling and validation
 * 5. Integration with parent Container
 * 6. Disposal and cleanup
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.mjs'
import { DIError, DIErrorCode } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

// ============================================================================
// SECTION 1: BASIC FUNCTIONALITY
// ============================================================================

describe('ScopedContainer: Basic Functionality', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Container creation and lifecycle', () => {
    it('should create a scoped container', () => {
      const scoped = container.createScope()
      expect(scoped).toBeDefined()
      expect(scoped.getParent()).toBe(container)
    })

    it('should support metadata', () => {
      const metadata = { userId: '123', sessionId: 'abc' }
      const scoped = container.createScope(metadata)

      expect(scoped.getMetadata('userId')).toBe('123')
      expect(scoped.getMetadata('sessionId')).toBe('abc')
      expect(scoped.getMetadata('nonExistent')).toBeUndefined()

      scoped.setMetadata('newKey', 'newValue')
      expect(scoped.getMetadata('newKey')).toBe('newValue')
    })
  })

  describe('Request-scoped service resolution', () => {
    it('should resolve request-scoped services from scoped container', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        id = ++instanceCount
      }

      const scoped = container.createScope()
      const instance1 = await scoped.get(RequestService)
      const instance2 = await scoped.get(RequestService)

      expect(instance1).toBeInstanceOf(RequestService)
      expect(instance1).toBe(instance2) // Same instance within request
      expect(instance1.id).toBe(1)

      await scoped.dispose()
    })

    it('should create different instances for different requests', async () => {
      let instanceCount = 0

      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        id = ++instanceCount
      }

      const scoped1 = container.createScope()
      const instance1 = await scoped1.get(RequestService)

      const scoped2 = container.createScope()
      const instance2 = await scoped2.get(RequestService)

      expect(instance1).not.toBe(instance2)
      expect(instance1.id).toBe(1)
      expect(instance2.id).toBe(2)

      await scoped1.dispose()
      await scoped2.dispose()
    })

    it('should delegate singleton services to parent', async () => {
      @Injectable({ scope: InjectableScope.Singleton })
      class SingletonService {
        id = Math.random()
      }

      const scoped = container.createScope()
      const instance1 = await scoped.get(SingletonService)
      const instance2 = await container.get(SingletonService)

      expect(instance1).toBe(instance2) // Same singleton instance

      await scoped.dispose()
    })

    it('should delegate transient services to parent', async () => {
      @Injectable({ scope: InjectableScope.Transient })
      class TransientService {
        id = Math.random()
      }

      const scoped = container.createScope()
      const instance1 = await scoped.get(TransientService)
      const instance2 = await scoped.get(TransientService)

      expect(instance1).not.toBe(instance2) // Different instances

      await scoped.dispose()
    })
  })

  describe('Disposal and cleanup', () => {
    it('should clean up request-scoped services on endRequest', async () => {
      let destroyCount = 0

      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        onServiceDestroy() {
          destroyCount++
        }
      }

      const scoped = container.createScope()
      await scoped.get(RequestService)
      await scoped.dispose()

      expect(destroyCount).toBe(1)
    })

    it('should prevent operations after disposal', async () => {
      const scoped = container.createScope()
      await scoped.dispose()

      await expect(scoped.get(Container)).rejects.toThrow('ScopedContainer has been disposed')
    })

    it('should support dispose alias', async () => {
      const scoped = container.createScope()
      await scoped.dispose()

      await expect(scoped.get(Container)).rejects.toThrow('ScopedContainer has been disposed')
    })
  })
})

// ============================================================================
// SECTION 2: addInstance METHOD TESTS
// ============================================================================

describe('ScopedContainer: addInstance Method', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('addInstance with class types', () => {
    it('should throw an error for unregistered class type', () => {
      class UnregisteredService {
        value = 'test'
      }

      const scoped = container.createScope()
      const instance = new UnregisteredService()
      expect(() => scoped.addInstance(UnregisteredService, instance)).toThrow(DIError)

      scoped.dispose()
    })

    it('should add instance for registered class type', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class RegisteredService {
        value = 'default'
      }

      const scoped = container.createScope()
      const customInstance = new RegisteredService()
      customInstance.value = 'custom'

      scoped.addInstance(RegisteredService, customInstance)

      // Should retrieve the added instance, not create a new one
      const retrieved = await scoped.get(RegisteredService)
      expect(retrieved).toBe(customInstance)
      expect(retrieved.value).toBe('custom')

      scoped.dispose()
    })
  })

  describe('addInstance with InjectionToken (no schema)', () => {
    it('should add instance for InjectionToken without schema', async () => {
      interface TestService {
        value: string
      }

      const token = InjectionToken.create<TestService>('TestService')
      const instance: TestService = { value: 'test' }

      const scoped = container.createScope()
      scoped.addInstance(token, instance)

      const retrieved = await scoped.get(token)
      expect(retrieved).toBe(instance)
      expect(retrieved.value).toBe('test')

      scoped.dispose()
    })

    it('should add instance for InjectionToken with optional schema', async () => {
      interface TestService {
        value: string
      }

      const optionalSchema = z
        .object({
          name: z.string(),
        })
        .optional()

      const token = InjectionToken.create<TestService, typeof optionalSchema>(
        'TestService',
        optionalSchema,
      )
      const instance: TestService = { value: 'test' }

      const scoped = container.createScope()
      scoped.addInstance(token, instance)

      const retrieved = await scoped.get(token)
      expect(retrieved).toBe(instance)

      scoped.dispose()
    })

    it('should reject InjectionToken with required schema', () => {
      interface TestService {
        value: string
      }

      const requiredSchema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const token = InjectionToken.create<TestService, typeof requiredSchema>(
        'TestService',
        requiredSchema,
      )
      const instance: TestService = { value: 'test' }

      const scoped = container.createScope()

      expect(() => {
        scoped.addInstance(token, instance)
      }).toThrow(DIError)

      const error = (() => {
        try {
          scoped.addInstance(token, instance)
        } catch (e) {
          return e
        }
      })() as DIError

      expect(error.code).toBe(DIErrorCode.TokenSchemaRequiredError)
      expect(error.message).toContain('requires schema arguments')

      scoped.dispose()
    })
  })

  describe('addInstance with BoundInjectionToken', () => {
    it('should add instance for BoundInjectionToken with required schema', async () => {
      interface TestService {
        value: string
      }

      const requiredSchema = z.object({
        name: z.string(),
        age: z.number(),
      })

      const token = InjectionToken.create<TestService, typeof requiredSchema>(
        'TestService',
        requiredSchema,
      )

      const boundToken = InjectionToken.bound(token, {
        name: 'John',
        age: 30,
      })

      const instance: TestService = { value: 'test' }

      const scoped = container.createScope()
      scoped.addInstance(boundToken, instance)

      const retrieved = await scoped.get(boundToken)
      expect(retrieved).toBe(instance)
      expect(retrieved.value).toBe('test')

      scoped.dispose()
    })

    it('should use bound value for instance name generation', async () => {
      interface TestService {
        value: string
      }

      const schema = z.object({
        id: z.string(),
      })

      const token = InjectionToken.create<TestService, typeof schema>('TestService', schema)

      const boundToken1 = InjectionToken.bound(token, { id: '1' })
      const boundToken2 = InjectionToken.bound(token, { id: '2' })

      const instance1: TestService = { value: 'instance1' }
      const instance2: TestService = { value: 'instance2' }

      const scoped = container.createScope()
      scoped.addInstance(boundToken1, instance1)
      scoped.addInstance(boundToken2, instance2)

      const retrieved1 = await scoped.get(boundToken1)
      const retrieved2 = await scoped.get(boundToken2)

      expect(retrieved1).toBe(instance1)
      expect(retrieved2).toBe(instance2)
      expect(retrieved1.value).toBe('instance1')
      expect(retrieved2.value).toBe('instance2')

      scoped.dispose()
    })
  })

  describe('addInstance error cases', () => {
    it('should reject addInstance on disposed container', async () => {
      class TestService {
        value = 'test'
      }

      const scoped = container.createScope()
      await scoped.dispose()

      const instance = new TestService()
      expect(() => {
        scoped.addInstance(TestService, instance)
      }).toThrow('ScopedContainer has been disposed')
    })

    it('should handle multiple addInstance calls for same token', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        value = 'test'
      }

      const scoped = container.createScope()
      const instance1 = new TestService()
      instance1.value = 'first'
      scoped.addInstance(TestService, instance1)

      // Second addInstance should overwrite (or throw if storage prevents it)
      const instance2 = new TestService()
      instance2.value = 'second'

      // Storage.storeInstance throws if instance already exists
      expect(() => {
        scoped.addInstance(TestService, instance2)
      }).toThrow()

      scoped.dispose()
    })
  })

  describe('addInstance integration with get', () => {
    it('should retrieve added instance via get method', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        value = 'custom'
      }

      const scoped = container.createScope()
      const instance = new TestService()
      scoped.addInstance(TestService, instance)

      const retrieved = await scoped.get(TestService)
      expect(retrieved).toBe(instance)
      expect(retrieved.value).toBe('custom')

      scoped.dispose()
    })
  })
})

// ============================================================================
// SECTION 3: COMPLEX SCENARIOS
// ============================================================================

describe('ScopedContainer: Complex Scenarios', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('Mixed scopes with addInstance', () => {
    it('should handle multiple addInstance calls with different token types', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class ClassService {
        value = 'class'
      }

      interface TokenService {
        value: string
      }
      const token = InjectionToken.create<TokenService>('TokenService')

      const schema = z.object({ id: z.string() })
      interface BoundService {
        value: string
      }
      const boundToken = InjectionToken.bound(
        InjectionToken.create<BoundService, typeof schema>('BoundService', schema),
        { id: '123' },
      )

      const scoped = container.createScope()

      const classInstance = new ClassService()
      scoped.addInstance(ClassService, classInstance)

      const tokenInstance: TokenService = { value: 'token' }
      scoped.addInstance(token, tokenInstance)

      const boundInstance: BoundService = { value: 'bound' }
      scoped.addInstance(boundToken, boundInstance)

      expect(await scoped.get(ClassService)).toBe(classInstance)
      expect(await scoped.get(token)).toBe(tokenInstance)
      expect(await scoped.get(boundToken)).toBe(boundInstance)

      scoped.dispose()
    })
  })

  describe('Invalidation with addInstance', () => {
    it('should invalidate added instances', async () => {
      let destroyCount = 0

      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        onServiceDestroy() {
          destroyCount++
        }
      }

      const scoped = container.createScope()
      const instance = new TestService()
      scoped.addInstance(TestService, instance)

      await scoped.invalidate(instance)
      expect(destroyCount).toBe(1)

      scoped.dispose()
    })
  })

  describe('Ready state with addInstance', () => {
    it('should wait for ready state after adding instances', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class TestService {
        value = 'test'
      }

      const scoped = container.createScope()
      const instance = new TestService()
      scoped.addInstance(TestService, instance)

      await scoped.ready() // Should complete without hanging

      scoped.dispose()
    })
  })
})
