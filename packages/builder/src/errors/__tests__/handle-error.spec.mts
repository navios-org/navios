import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod/v4'

import { handleError } from '../handle-error.mjs'
import { UnknownResponseError } from '../unknown-response-error.mjs'

import type { AbstractResponse, BuilderConfig } from '../../types/index.mjs'

describe('handleError', () => {
  const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
  })

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

  describe('without useDiscriminatorResponse', () => {
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

  describe('with useDiscriminatorResponse', () => {
    it('should parse error response data when response exists', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { success: false, message: 'Not found' },
          status: 404,
          statusText: 'Not Found',
          headers: {},
        } satisfies AbstractResponse<unknown>,
      }

      const result = handleError(config, error, responseSchema)

      expect(result).toEqual({ success: false, message: 'Not found' })
    })

    it('should throw when error has no response property', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = new Error('Network error')

      expect(() => handleError(config, error, responseSchema)).toThrow('Network error')
    })

    it('should throw when error.response is falsy', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = { response: null }

      expect(() => handleError(config, error, responseSchema)).toThrow()
    })

    it('should throw when no responseSchema is provided', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { success: false, message: 'Error' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      expect(() => handleError(config, error)).toThrow()
    })

    it('should call onZodError when response parsing fails', () => {
      const onZodError = vi.fn()
      const config: BuilderConfig<true> = {
        useDiscriminatorResponse: true,
        onZodError,
      }
      const response: AbstractResponse<unknown> = {
        data: { invalid: 'data' },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
      }
      const originalError = { response }

      expect(() => handleError(config, originalError, responseSchema)).toThrow(ZodError)

      expect(onZodError).toHaveBeenCalledTimes(1)
      expect(onZodError.mock.calls[0][0]).toBeInstanceOf(ZodError)
      expect(onZodError.mock.calls[0][1]).toBe(response)
      expect(onZodError.mock.calls[0][2]).toBe(originalError)
    })

    it('should rethrow ZodError when response parsing fails', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { wrong: 'shape' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      expect(() => handleError(config, error, responseSchema)).toThrow(ZodError)
    })
  })

  describe('edge cases', () => {
    it('should handle error that is not an object', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }

      expect(() => handleError(config, 'string error')).toThrow()
      expect(() => handleError(config, 123)).toThrow()
      expect(() => handleError(config, null)).toThrow()
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
      expect(callOrder).toEqual(['onError', 'onZodError'])
    })

    it('should work with discriminated union schema', () => {
      const discriminatedSchema = z.discriminatedUnion('status', [
        z.object({ status: z.literal('success'), data: z.string() }),
        z.object({ status: z.literal('error'), error: z.string() }),
      ])

      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { status: 'error', error: 'Something went wrong' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      const result = handleError(config, error, discriminatedSchema)

      expect(result).toEqual({
        status: 'error',
        error: 'Something went wrong',
      })
    })
  })

  describe('with errorSchema', () => {
    const error400Schema = z.object({ error: z.string(), field: z.string() })
    const error404Schema = z.object({ notFound: z.literal(true) })

    const errorSchema = {
      400: error400Schema,
      404: error404Schema,
    }

    it('should return parsed error when status code matches errorSchema', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { error: 'Invalid input', field: 'email' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        } satisfies AbstractResponse<unknown>,
      }

      const result = handleError(config, error, undefined, errorSchema)

      expect(result).toEqual({ error: 'Invalid input', field: 'email', __status: 400 })
    })

    it('should return parsed error for 404 status code', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { notFound: true },
          status: 404,
          statusText: 'Not Found',
          headers: {},
        } satisfies AbstractResponse<unknown>,
      }

      const result = handleError(config, error, undefined, errorSchema)

      expect(result).toEqual({ notFound: true, __status: 404 })
    })

    it('should throw UnknownResponseError when status code does not match any errorSchema key', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { message: 'Server error' },
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
        } satisfies AbstractResponse<unknown>,
      }

      expect(() => handleError(config, error, undefined, errorSchema)).toThrow(UnknownResponseError)
    })

    it('should include correct statusCode in UnknownResponseError', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const response: AbstractResponse<unknown> = {
        data: { message: 'Server error' },
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
      }
      const error = { response }

      try {
        handleError(config, error, undefined, errorSchema)
        throw new Error('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(UnknownResponseError)
        expect((e as UnknownResponseError).statusCode).toBe(500)
        expect((e as UnknownResponseError).response).toBe(response)
      }
    })

    it('should call onZodError when errorSchema parsing fails', () => {
      const onZodError = vi.fn()
      const config: BuilderConfig<true> = {
        useDiscriminatorResponse: true,
        onZodError,
      }
      const response: AbstractResponse<unknown> = {
        data: { wrongShape: true },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
      }
      const originalError = { response }

      expect(() => handleError(config, originalError, undefined, errorSchema)).toThrow(ZodError)

      expect(onZodError).toHaveBeenCalledTimes(1)
      expect(onZodError.mock.calls[0][0]).toBeInstanceOf(ZodError)
      expect(onZodError.mock.calls[0][1]).toBe(response)
      expect(onZodError.mock.calls[0][2]).toBe(originalError)
    })

    it('should still throw when useDiscriminatorResponse is false even with errorSchema', () => {
      const config: BuilderConfig = { useDiscriminatorResponse: false }
      const error = new Error('Network error')

      expect(() => handleError(config, error, undefined, errorSchema)).toThrow('Network error')
    })

    it('should fall back to responseSchema when errorSchema is not provided', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { success: false, message: 'Error occurred' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      const result = handleError(config, error, responseSchema, undefined)

      expect(result).toEqual({ success: false, message: 'Error occurred' })
    })

    it('should prioritize errorSchema over responseSchema when both provided', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = {
        response: {
          data: { error: 'Validation failed', field: 'username' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      // Even though responseSchema is provided, errorSchema should be used
      const result = handleError(config, error, responseSchema, errorSchema)

      expect(result).toEqual({ error: 'Validation failed', field: 'username', __status: 400 })
    })

    it('should throw original error when error has no response and errorSchema is provided', () => {
      const config: BuilderConfig<true> = { useDiscriminatorResponse: true }
      const error = new Error('Network error')

      expect(() => handleError(config, error, undefined, errorSchema)).toThrow('Network error')
    })

    it('should call onError before checking errorSchema', () => {
      const onError = vi.fn()
      const config: BuilderConfig<true> = {
        useDiscriminatorResponse: true,
        onError,
      }
      const error = {
        response: {
          data: { error: 'Bad request', field: 'email' },
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        },
      }

      handleError(config, error, undefined, errorSchema)

      expect(onError).toHaveBeenCalledWith(error)
    })
  })
})
