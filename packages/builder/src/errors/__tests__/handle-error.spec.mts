import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import { handleError } from '../handle-error.mjs'

import type { BuilderConfig } from '../../types/index.mjs'

describe('handleError', () => {
  describe('onError callback', () => {
    it('should call onError when provided', () => {
      const onError = vi.fn()
      const config: BuilderConfig = { onError }
      const error = new Error('Test error')

      expect(() => handleError(config, error)).toThrow('Test error')
      expect(onError).toHaveBeenCalledWith(error)
    })

    it('should call onError before throwing', () => {
      const callOrder: string[] = []
      const onError = vi.fn(() => callOrder.push('onError'))
      const config: BuilderConfig = { onError }
      const error = new Error('Test error')

      try {
        handleError(config, error)
      } catch {
        callOrder.push('thrown')
      }

      expect(callOrder).toEqual(['onError', 'thrown'])
    })

    it('should not call onError when not provided', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test error')

      expect(() => handleError(config, error)).toThrow('Test error')
    })
  })

  describe('rethrow behaviour', () => {
    it('should rethrow the error', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test error')

      expect(() => handleError(config, error)).toThrow('Test error')
    })

    it('should call onZodError for ZodError', () => {
      const onZodError = vi.fn()
      const config: BuilderConfig = { onZodError }

      // Create a ZodError by actually parsing invalid data
      const testSchema = z.object({ field: z.string() })
      let zodError: ZodError
      try {
        testSchema.parse({ field: 123 })
        throw new Error('Should not reach here')
      } catch (e) {
        zodError = e as ZodError
      }

      expect(() => handleError(config, zodError)).toThrow(ZodError)
      expect(onZodError).toHaveBeenCalledWith(zodError, undefined, undefined)
    })

    it('should not call onZodError for non-ZodError', () => {
      const onZodError = vi.fn()
      const config: BuilderConfig = { onZodError }
      const error = new Error('Regular error')

      expect(() => handleError(config, error)).toThrow('Regular error')
      expect(onZodError).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle error that is not an object', () => {
      const config: BuilderConfig = {}

      expect(() => handleError(config, 'string error')).toThrow()
      expect(() => handleError(config, 123)).toThrow()
      // Throwing null produces an undefined-ish throw; vitest only catches truthy throws here
      try {
        handleError(config, null)
        throw new Error('Should have thrown')
      } catch (e) {
        expect(e).toBeNull()
      }
    })

    it('should handle empty config', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test')

      expect(() => handleError(config, error)).toThrow('Test')
    })

    it('should call both onError and onZodError in order', () => {
      const callOrder: string[] = []
      const onError = vi.fn(() => callOrder.push('onError'))
      const onZodError = vi.fn(() => callOrder.push('onZodError'))
      const config: BuilderConfig = { onError, onZodError }

      const testSchema = z.object({ field: z.string() })
      let zodError: ZodError
      try {
        testSchema.parse({ field: 123 })
        throw new Error('Should not reach here')
      } catch (e) {
        zodError = e as ZodError
      }

      expect(() => handleError(config, zodError)).toThrow(ZodError)
      expect(callOrder).toEqual(['onError', 'onZodError'])
    })
  })
})
