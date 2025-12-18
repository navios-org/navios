import { describe, expect, it } from 'vitest'

import { DIError, DIErrorCode } from '../errors/index.mjs'

describe('DIError', () => {
  describe('factoryNotFound', () => {
    it('should create error with proper message and code', () => {
      const error = DIError.factoryNotFound('TestFactory')

      expect(error.message).toBe('Factory TestFactory not found')
      expect(error.code).toBe(DIErrorCode.FactoryNotFound)
      expect(error.context?.name).toBe('TestFactory')
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })

    it('should be throwable', () => {
      expect(() => {
        throw DIError.factoryNotFound('SomeFactory')
      }).toThrow('Factory SomeFactory not found')
    })
  })

  describe('instanceDestroying', () => {
    it('should create error with proper message and code', () => {
      const error = DIError.instanceDestroying('TestInstance')

      expect(error.message).toBe('Instance TestInstance destroying')
      expect(error.code).toBe(DIErrorCode.InstanceDestroying)
      expect(error.context?.name).toBe('TestInstance')
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })

    it('should be throwable', () => {
      expect(() => {
        throw DIError.instanceDestroying('SomeInstance')
      }).toThrow('Instance SomeInstance destroying')
    })
  })

  describe('instanceNotFound', () => {
    it('should create error with proper message and code', () => {
      const error = DIError.instanceNotFound('TestInstance')

      expect(error.message).toBe('Instance TestInstance not found')
      expect(error.code).toBe(DIErrorCode.InstanceNotFound)
      expect(error.context?.name).toBe('TestInstance')
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })
  })

  describe('factoryTokenNotResolved', () => {
    it('should create error with proper message and code', () => {
      const error = DIError.factoryTokenNotResolved('TestToken')

      expect(error.message).toBe('Factory token not resolved: TestToken')
      expect(error.code).toBe(DIErrorCode.FactoryTokenNotResolved)
      expect(error.context?.token).toBe('TestToken')
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })
  })

  describe('unknown', () => {
    it('should create error with string message', () => {
      const error = DIError.unknown('Test error message')

      expect(error.message).toBe('Test error message')
      expect(error.code).toBe(DIErrorCode.UnknownError)
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })

    it('should create error with Error object', () => {
      const originalError = new Error('Original error')
      const error = DIError.unknown(originalError)

      expect(error.message).toBe('Original error')
      expect(error.code).toBe(DIErrorCode.UnknownError)
      expect(error.context?.parent).toBe(originalError)
      expect(error).toBeInstanceOf(DIError)
      expect(error).not.toBeInstanceOf(Error)
    })
  })
})
