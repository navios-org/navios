import { z } from 'zod/v4'
import { describe, expect, it } from 'vitest'

import { DIError, DIErrorCode } from '../errors/index.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import type { FactoryRecord } from '../token/registry.mjs'

describe('DIError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new DIError(DIErrorCode.FactoryNotFound, 'Test message')

      expect(error.code).toBe(DIErrorCode.FactoryNotFound)
      expect(error.message).toBe('Test message')
      expect(error.name).toBe('DIError')
      expect(error.context).toBeUndefined()
    })

    it('should create error with context', () => {
      const context = { key: 'value', num: 42 }
      const error = new DIError(
        DIErrorCode.InstanceNotFound,
        'Test message',
        context,
      )

      expect(error.context).toEqual(context)
    })

    it('should extend Error class', () => {
      const error = new DIError(DIErrorCode.UnknownError, 'Test')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('factoryNotFound', () => {
    it('should create FactoryNotFound error', () => {
      const error = DIError.factoryNotFound('MyService')

      expect(error.code).toBe(DIErrorCode.FactoryNotFound)
      expect(error.message).toBe('Factory MyService not found')
      expect(error.context).toEqual({ name: 'MyService' })
    })
  })

  describe('factoryTokenNotResolved', () => {
    it('should create FactoryTokenNotResolved error with string token', () => {
      const error = DIError.factoryTokenNotResolved('test-token')

      expect(error.code).toBe(DIErrorCode.FactoryTokenNotResolved)
      expect(error.message).toBe('Factory token not resolved: test-token')
      expect(error.context).toEqual({ token: 'test-token' })
    })

    it('should create FactoryTokenNotResolved error with symbol token', () => {
      const sym = Symbol('test')
      const error = DIError.factoryTokenNotResolved(sym)

      expect(error.code).toBe(DIErrorCode.FactoryTokenNotResolved)
      expect(error.message).toContain('Symbol(test)')
    })

    it('should handle null/undefined token', () => {
      const error = DIError.factoryTokenNotResolved(null)

      expect(error.code).toBe(DIErrorCode.FactoryTokenNotResolved)
      expect(error.message).toBe('Factory token not resolved: unknown')
    })
  })

  describe('instanceNotFound', () => {
    it('should create InstanceNotFound error', () => {
      const error = DIError.instanceNotFound('MyInstance')

      expect(error.code).toBe(DIErrorCode.InstanceNotFound)
      expect(error.message).toBe('Instance MyInstance not found')
      expect(error.context).toEqual({ name: 'MyInstance' })
    })
  })

  describe('instanceDestroying', () => {
    it('should create InstanceDestroying error', () => {
      const error = DIError.instanceDestroying('MyInstance')

      expect(error.code).toBe(DIErrorCode.InstanceDestroying)
      expect(error.message).toBe('Instance MyInstance destroying')
      expect(error.context).toEqual({ name: 'MyInstance' })
    })
  })

  describe('unknown', () => {
    it('should create UnknownError from string message', () => {
      const error = DIError.unknown('Something went wrong')

      expect(error.code).toBe(DIErrorCode.UnknownError)
      expect(error.message).toBe('Something went wrong')
    })

    it('should create UnknownError from Error object', () => {
      const originalError = new Error('Original error')
      const error = DIError.unknown(originalError)

      expect(error.code).toBe(DIErrorCode.UnknownError)
      expect(error.message).toBe('Original error')
      expect(error.context?.parent).toBe(originalError)
    })

    it('should include additional context', () => {
      const error = DIError.unknown('Error', { extra: 'data' })

      expect(error.context).toEqual({ extra: 'data' })
    })

    it('should merge context with parent Error', () => {
      const originalError = new Error('Original')
      const error = DIError.unknown(originalError, { extra: 'data' })

      expect(error.context?.parent).toBe(originalError)
      expect(error.context?.extra).toBe('data')
    })
  })

  describe('circularDependency', () => {
    it('should create CircularDependency error', () => {
      const cycle = ['ServiceA', 'ServiceB', 'ServiceC', 'ServiceA']
      const error = DIError.circularDependency(cycle)

      expect(error.code).toBe(DIErrorCode.CircularDependency)
      expect(error.message).toBe(
        'Circular dependency detected: ServiceA -> ServiceB -> ServiceC -> ServiceA',
      )
      expect(error.context).toEqual({ cycle })
    })

    it('should handle self-referential cycle', () => {
      const cycle = ['ServiceA', 'ServiceA']
      const error = DIError.circularDependency(cycle)

      expect(error.message).toBe(
        'Circular dependency detected: ServiceA -> ServiceA',
      )
    })
  })

  describe('tokenValidationError', () => {
    it('should create TokenValidationError', () => {
      const schema = z.object({ name: z.string() })
      const value = { name: 123 }
      const error = DIError.tokenValidationError(
        'Validation failed',
        schema,
        value,
      )

      expect(error.code).toBe(DIErrorCode.TokenValidationError)
      expect(error.message).toBe('Validation failed')
      expect(error.context?.schema).toBe(schema)
      expect(error.context?.value).toEqual(value)
    })

    it('should handle undefined schema', () => {
      const error = DIError.tokenValidationError(
        'Validation failed',
        undefined,
        null,
      )

      expect(error.context?.schema).toBeUndefined()
    })
  })

  describe('tokenSchemaRequiredError', () => {
    it('should create TokenSchemaRequiredError with string token', () => {
      const error = DIError.tokenSchemaRequiredError('TestToken')

      expect(error.code).toBe(DIErrorCode.TokenSchemaRequiredError)
      expect(error.message).toContain('TestToken')
      expect(error.message).toContain('requires schema arguments')
    })

    it('should create TokenSchemaRequiredError with symbol token', () => {
      const sym = Symbol('test')
      const error = DIError.tokenSchemaRequiredError(sym)

      expect(error.code).toBe(DIErrorCode.TokenSchemaRequiredError)
      expect(error.message).toContain('Symbol(test)')
    })

    it('should handle null/undefined token', () => {
      const error = DIError.tokenSchemaRequiredError(null)

      expect(error.message).toContain('unknown')
    })
  })

  describe('classNotInjectable', () => {
    it('should create ClassNotInjectable error', () => {
      const error = DIError.classNotInjectable('MyClass')

      expect(error.code).toBe(DIErrorCode.ClassNotInjectable)
      expect(error.message).toBe(
        'Class MyClass is not decorated with @Injectable.',
      )
      expect(error.context).toEqual({ className: 'MyClass' })
    })
  })

  describe('scopeMismatchError', () => {
    it('should create ScopeMismatchError', () => {
      const error = DIError.scopeMismatchError(
        'TestToken',
        'Singleton',
        'Request',
      )

      expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
      expect(error.message).toBe(
        'Scope mismatch for TestToken: expected Singleton, got Request',
      )
      expect(error.context).toEqual({
        token: 'TestToken',
        expectedScope: 'Singleton',
        actualScope: 'Request',
      })
    })
  })

  describe('priorityConflictError', () => {
    it('should create PriorityConflictError', () => {
      const token = InjectionToken.create<string>('test')
      const records: FactoryRecord[] = [
        {
          scope: InjectableScope.Singleton,
          originalToken: token,
          target: class A {},
          type: InjectableType.Class,
          priority: 1,
        },
        {
          scope: InjectableScope.Singleton,
          originalToken: token,
          target: class B {},
          type: InjectableType.Class,
          priority: 1,
        },
      ]

      const error = DIError.priorityConflictError('TestToken', records)

      expect(error.code).toBe(DIErrorCode.PriorityConflictError)
      expect(error.message).toContain('Priority conflict')
      expect(error.context?.records).toBe(records)
    })
  })

  describe('storageError', () => {
    it('should create StorageError with instance name', () => {
      const error = DIError.storageError('Failed to store', 'set', 'MyInstance')

      expect(error.code).toBe(DIErrorCode.StorageError)
      expect(error.message).toBe('Storage error: Failed to store')
      expect(error.context).toEqual({
        operation: 'set',
        instanceName: 'MyInstance',
      })
    })

    it('should create StorageError without instance name', () => {
      const error = DIError.storageError('Failed to clear', 'clear')

      expect(error.context?.instanceName).toBeUndefined()
    })
  })

  describe('initializationError', () => {
    it('should create InitializationError from Error', () => {
      const originalError = new Error('Constructor failed')
      const error = DIError.initializationError('MyService', originalError)

      expect(error.code).toBe(DIErrorCode.InitializationError)
      expect(error.message).toBe(
        'Service MyService initialization failed: Constructor failed',
      )
      expect(error.context?.error).toBe(originalError)
    })

    it('should create InitializationError from string', () => {
      const error = DIError.initializationError(
        'MyService',
        'Missing dependency',
      )

      expect(error.message).toBe(
        'Service MyService initialization failed: Missing dependency',
      )
    })
  })

  describe('dependencyResolutionError', () => {
    it('should create DependencyResolutionError from Error', () => {
      const originalError = new Error('Not found')
      const error = DIError.dependencyResolutionError(
        'MyService',
        'DatabaseService',
        originalError,
      )

      expect(error.code).toBe(DIErrorCode.DependencyResolutionError)
      expect(error.message).toBe(
        'Failed to resolve dependency DatabaseService for service MyService: Not found',
      )
      expect(error.context).toEqual({
        serviceName: 'MyService',
        dependencyName: 'DatabaseService',
        error: originalError,
      })
    })

    it('should create DependencyResolutionError from string', () => {
      const error = DIError.dependencyResolutionError(
        'MyService',
        'DatabaseService',
        'Connection failed',
      )

      expect(error.message).toContain('Connection failed')
    })
  })

  describe('DIErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(DIErrorCode.FactoryNotFound).toBe('FactoryNotFound')
      expect(DIErrorCode.FactoryTokenNotResolved).toBe('FactoryTokenNotResolved')
      expect(DIErrorCode.InstanceNotFound).toBe('InstanceNotFound')
      expect(DIErrorCode.InstanceDestroying).toBe('InstanceDestroying')
      expect(DIErrorCode.CircularDependency).toBe('CircularDependency')
      expect(DIErrorCode.TokenValidationError).toBe('TokenValidationError')
      expect(DIErrorCode.TokenSchemaRequiredError).toBe('TokenSchemaRequiredError')
      expect(DIErrorCode.ClassNotInjectable).toBe('ClassNotInjectable')
      expect(DIErrorCode.ScopeMismatchError).toBe('ScopeMismatchError')
      expect(DIErrorCode.PriorityConflictError).toBe('PriorityConflictError')
      expect(DIErrorCode.StorageError).toBe('StorageError')
      expect(DIErrorCode.InitializationError).toBe('InitializationError')
      expect(DIErrorCode.DependencyResolutionError).toBe(
        'DependencyResolutionError',
      )
      expect(DIErrorCode.UnknownError).toBe('UnknownError')
    })
  })
})
