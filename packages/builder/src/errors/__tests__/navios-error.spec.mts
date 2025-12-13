import { describe, expect, it } from 'vitest'

import { NaviosError } from '../navios-error.mjs'

describe('NaviosError', () => {
  describe('constructor', () => {
    it('should create an error with a message', () => {
      const error = new NaviosError('Test error message')

      expect(error.message).toBe('Test error message')
    })

    it('should set the name property to NaviosError', () => {
      const error = new NaviosError('Test error')

      expect(error.name).toBe('NaviosError')
    })

    it('should be an instance of Error', () => {
      const exception = new NaviosError('Test error')

      expect(exception).toBeInstanceOf(Error)
    })

    it('should be an instance of NaviosError', () => {
      const exception = new NaviosError('Test error')

      expect(exception).toBeInstanceOf(NaviosError)
    })
  })

  describe('error handling', () => {
    it('should be catchable as Error', () => {
      let caught: Error | null = null

      try {
        throw new NaviosError('Caught error')
      } catch (error) {
        caught = error as Error
      }

      expect(caught).toBeInstanceOf(Error)
      expect(caught?.message).toBe('Caught error')
    })

    it('should be catchable as NaviosError', () => {
      let caught: NaviosError | null = null

      try {
        throw new NaviosError('Specific error')
      } catch (error) {
        if (error instanceof NaviosError) {
          caught = error
        }
      }

      expect(caught).toBeInstanceOf(NaviosError)
      expect(caught?.name).toBe('NaviosError')
    })

    it('should have a stack trace', () => {
      const exception = new NaviosError('Stack trace test')

      expect(exception.stack).toBeDefined()
      expect(exception.stack).toContain('NaviosError')
    })
  })

  describe('message formatting', () => {
    it('should handle empty message', () => {
      const exception = new NaviosError('')

      expect(exception.message).toBe('')
    })

    it('should handle message with special characters', () => {
      const message = 'Error: [Code-123] Something went wrong! (details: "test")'
      const exception = new NaviosError(message)

      expect(exception.message).toBe(message)
    })

    it('should handle multiline message', () => {
      const message = 'Line 1\nLine 2\nLine 3'
      const exception = new NaviosError(message)

      expect(exception.message).toBe(message)
    })

    it('should preserve the exact message', () => {
      const messages = [
        '[Navios-API]: Client was not provided',
        'Request failed with status 404',
        'Invalid response schema',
      ]

      for (const message of messages) {
        const exception = new NaviosError(message)
        expect(exception.message).toBe(message)
      }
    })
  })

  describe('type checking', () => {
    it('should be distinguishable from regular Error', () => {
      const naviosError = new NaviosError('Navios error')
      const regularError = new Error('Regular error')

      expect(naviosError instanceof NaviosError).toBe(true)
      expect(regularError instanceof NaviosError).toBe(false)
    })

    it('should allow type-safe error handling', () => {
      function throwNaviosError(): never {
        throw new NaviosError('Expected error')
      }

      expect(() => throwNaviosError()).toThrow(NaviosError)
    })
  })

  describe('toString', () => {
    it('should include the name and message in string representation', () => {
      const exception = new NaviosError('Test message')

      expect(exception.toString()).toContain('NaviosError')
      expect(exception.toString()).toContain('Test message')
    })
  })
})
