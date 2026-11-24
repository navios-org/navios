import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { DIError, DIErrorCode } from '../errors/index.mjs'

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
      const error = new DIError(DIErrorCode.InstanceNotFound, 'Test message', context)

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

      expect(error.message).toBe('Circular dependency detected: ServiceA -> ServiceA')
    })
  })

  describe('tokenValidationError', () => {
    it('should create TokenValidationError', () => {
      const schema = z.object({ name: z.string() })
      const value = { name: 123 }
      const error = DIError.tokenValidationError('Validation failed', schema, value)

      expect(error.code).toBe(DIErrorCode.TokenValidationError)
      expect(error.message).toBe('Validation failed')
      expect(error.context?.schema).toBe(schema)
      expect(error.context?.value).toEqual(value)
    })

    it('should handle undefined schema', () => {
      const error = DIError.tokenValidationError('Validation failed', undefined, null)

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
      expect(error.message).toBe('Class MyClass is not decorated with @Injectable.')
      expect(error.context).toEqual({ className: 'MyClass' })
    })
  })

  describe('scopeMismatchError', () => {
    it('should create ScopeMismatchError', () => {
      const error = DIError.scopeMismatchError('TestToken', 'Singleton', 'Request')

      expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
      expect(error.message).toBe('Scope mismatch for TestToken: expected Singleton, got Request')
      expect(error.context).toEqual({
        token: 'TestToken',
        expectedScope: 'Singleton',
        actualScope: 'Request',
      })
    })
  })

  describe('initializationError', () => {
    it('should create InitializationError from Error', () => {
      const originalError = new Error('Constructor failed')
      const error = DIError.initializationError('MyService', originalError)

      expect(error.code).toBe(DIErrorCode.InitializationError)
      expect(error.message).toBe('Service MyService initialization failed: Constructor failed')
      expect(error.context?.error).toBe(originalError)
      expect(error.cause).toBe(originalError)
    })

    it('should create InitializationError from string', () => {
      const error = DIError.initializationError('MyService', 'Missing dependency')

      expect(error.message).toBe('Service MyService initialization failed: Missing dependency')
    })
  })

  describe('requestScopeFromRoot', () => {
    it('should create ScopeMismatchError with the resolution path', () => {
      const error = DIError.requestScopeFromRoot('RequestService', ['SingletonService'])

      expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
      expect(error.message).toContain(
        'Scope mismatch: RequestService is request-scoped and cannot be resolved from the root container (SingletonService -> RequestService)',
      )
      expect(error.context).toEqual({ name: 'RequestService', path: ['SingletonService'] })
    })

    it('should omit the path when resolved directly', () => {
      const error = DIError.requestScopeFromRoot('RequestService', [])

      expect(error.message).toContain(
        'RequestService is request-scoped and cannot be resolved from the root container.',
      )
    })
  })

  describe('providerConflict', () => {
    it('should create ProviderConflict error', () => {
      const error = DIError.providerConflict('TestToken', 'ImplA', 'ImplB')

      expect(error.code).toBe(DIErrorCode.ProviderConflict)
      expect(error.message).toContain('Token TestToken already has a default provider (ImplA)')
      expect(error.context).toEqual({ token: 'TestToken', existing: 'ImplA', incoming: 'ImplB' })
    })
  })

  describe('asyncInitRequired', () => {
    it('should create AsyncInitRequired error', () => {
      const error = DIError.asyncInitRequired('MyService')

      expect(error.code).toBe(DIErrorCode.AsyncInitRequired)
      expect(error.message).toContain('MyService')
      expect(error.context).toEqual({ name: 'MyService' })
    })
  })

  describe('containerDisposed', () => {
    it('should create ContainerDisposed error', () => {
      const error = DIError.containerDisposed('ScopedContainer')

      expect(error.code).toBe(DIErrorCode.ContainerDisposed)
      expect(error.message).toBe('ScopedContainer has been disposed')
      expect(error.context).toEqual({ kind: 'ScopedContainer' })
    })
  })

  describe('DIErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(DIErrorCode.FactoryNotFound).toBe('FactoryNotFound')
      expect(DIErrorCode.InstanceNotFound).toBe('InstanceNotFound')
      expect(DIErrorCode.InstanceDestroying).toBe('InstanceDestroying')
      expect(DIErrorCode.CircularDependency).toBe('CircularDependency')
      expect(DIErrorCode.TokenValidationError).toBe('TokenValidationError')
      expect(DIErrorCode.TokenSchemaRequiredError).toBe('TokenSchemaRequiredError')
      expect(DIErrorCode.ClassNotInjectable).toBe('ClassNotInjectable')
      expect(DIErrorCode.ScopeMismatchError).toBe('ScopeMismatchError')
      expect(DIErrorCode.ProviderConflict).toBe('ProviderConflict')
      expect(DIErrorCode.AsyncInitRequired).toBe('AsyncInitRequired')
      expect(DIErrorCode.ContainerDisposed).toBe('ContainerDisposed')
      expect(DIErrorCode.InitializationError).toBe('InitializationError')
      expect(DIErrorCode.UnknownError).toBe('UnknownError')
      expect(Object.keys(DIErrorCode)).toHaveLength(13)
    })
  })
})
