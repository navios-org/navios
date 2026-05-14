import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import { handleError } from '../handle-error.mjs'

import type { BuilderConfig, BuilderErrorEvent } from '../../types/index.mjs'

const endpoint = { method: 'GET' as const, url: '/u' }

describe('handleError', () => {
  describe('onError callback', () => {
    it('should fire onError with a structured event when provided', () => {
      const onError = vi.fn<(event: BuilderErrorEvent) => void>()
      const config: BuilderConfig = { onError }
      const error = new Error('Test error')

      expect(() => handleError(config, error, endpoint)).toThrow('Test error')
      expect(onError).toHaveBeenCalledTimes(1)
      const event = onError.mock.calls[0][0]
      expect(event.endpoint).toEqual(endpoint)
      // A plain Error (no `response`) classifies as a network failure.
      expect(event.kind).toBe('network')
      expect(event.cause).toBe(error)
      expect(event.status).toBeUndefined()
    })

    it('should fire onError before throwing', () => {
      const callOrder: string[] = []
      const onError = vi.fn(() => callOrder.push('onError'))
      const config: BuilderConfig = { onError }
      const error = new Error('Test error')

      try {
        handleError(config, error, endpoint)
      } catch {
        callOrder.push('thrown')
      }

      expect(callOrder).toEqual(['onError', 'thrown'])
    })

    it('should still throw when onError is not provided', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test error')

      expect(() => handleError(config, error, endpoint)).toThrow('Test error')
    })

    it('should classify HTTP-shaped errors with status', () => {
      const onError = vi.fn<(event: BuilderErrorEvent) => void>()
      const config: BuilderConfig = { onError }
      const error = {
        response: { data: 'oops', status: 500, statusText: 'SE', headers: new Headers() },
      }

      expect(() => handleError(config, error, endpoint)).toThrow()
      const event = onError.mock.calls[0][0]
      // No errorSchema is passed in data mode, so all HTTP-with-response errors
      // classify as `http-unknown`.
      expect(event.kind).toBe('http-unknown')
      expect(event.status).toBe(500)
      expect(event.body).toBe('oops')
      expect(event.endpoint).toEqual(endpoint)
    })

    it('should classify ZodError as network (no response attached)', () => {
      const onError = vi.fn<(event: BuilderErrorEvent) => void>()
      const config: BuilderConfig = { onError }

      const testSchema = z.object({ field: z.string() })
      let zodError: ZodError
      try {
        testSchema.parse({ field: 123 })
        throw new Error('Should not reach here')
      } catch (e) {
        zodError = e as ZodError
      }

      expect(() => handleError(config, zodError, endpoint)).toThrow(ZodError)
      const event = onError.mock.calls[0][0]
      // A bare ZodError has no `response`, so it classifies as network.
      expect(event.kind).toBe('network')
      expect(event.cause).toBe(zodError)
    })
  })

  describe('rethrow behaviour', () => {
    it('should rethrow the error', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test error')

      expect(() => handleError(config, error, endpoint)).toThrow('Test error')
    })
  })

  describe('edge cases', () => {
    it('should handle error that is not an object', () => {
      const config: BuilderConfig = {}

      expect(() => handleError(config, 'string error', endpoint)).toThrow()
      expect(() => handleError(config, 123, endpoint)).toThrow()
      // Throwing null produces an undefined-ish throw; vitest only catches truthy throws here
      try {
        handleError(config, null, endpoint)
        throw new Error('Should have thrown')
      } catch (e) {
        expect(e).toBeNull()
      }
    })

    it('should handle empty config', () => {
      const config: BuilderConfig = {}
      const error = new Error('Test')

      expect(() => handleError(config, error, endpoint)).toThrow('Test')
    })
  })
})
