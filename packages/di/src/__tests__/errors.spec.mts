import { describe, expect, it } from 'vitest'

import { ErrorsEnum } from '../errors/errors.enum.mjs'
import {
  FactoryNotFound,
  InstanceDestroying,
  InstanceExpired,
} from '../errors/index.mjs'

describe('Error Classes', () => {
  describe('FactoryNotFound', () => {
    it('should create error with proper message and code', () => {
      const error = new FactoryNotFound('TestFactory')

      expect(error.message).toBe('Factory TestFactory not found')
      expect(error.code).toBe(ErrorsEnum.FactoryNotFound)
      expect(error.name).toBe('TestFactory')
      expect(error).toBeInstanceOf(Error)
    })

    it('should be throwable', () => {
      expect(() => {
        throw new FactoryNotFound('SomeFactory')
      }).toThrow('Factory SomeFactory not found')
    })
  })

  describe('InstanceDestroying', () => {
    it('should create error with proper message and code', () => {
      const error = new InstanceDestroying('TestInstance')

      expect(error.message).toBe('Instance TestInstance destroying')
      expect(error.code).toBe(ErrorsEnum.InstanceDestroying)
      expect(error.name).toBe('TestInstance')
      expect(error).toBeInstanceOf(Error)
    })

    it('should be throwable', () => {
      expect(() => {
        throw new InstanceDestroying('SomeInstance')
      }).toThrow('Instance SomeInstance destroying')
    })
  })

  describe('InstanceExpired', () => {
    it('should create error with proper message and code', () => {
      const error = new InstanceExpired('TestInstance')

      expect(error.message).toBe('Instance TestInstance expired')
      expect(error.code).toBe(ErrorsEnum.InstanceExpired)
      expect(error.name).toBe('TestInstance')
      expect(error).toBeInstanceOf(Error)
    })

    it('should be throwable', () => {
      expect(() => {
        throw new InstanceExpired('SomeInstance')
      }).toThrow('Instance SomeInstance expired')
    })
  })
})
