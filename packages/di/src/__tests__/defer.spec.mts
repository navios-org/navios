import { describe, expect, it } from 'vitest'

import { createDeferred, Deferred } from '../utils/defer.mjs'

describe('Deferred', () => {
  describe('constructor', () => {
    it('should create a deferred promise', () => {
      const deferred = new Deferred<string>()

      expect(deferred.promise).toBeInstanceOf(Promise)
      expect(deferred.isResolved).toBe(false)
      expect(deferred.isRejected).toBe(false)
      expect(deferred.isSettled).toBe(false)
    })
  })

  describe('resolve', () => {
    it('should resolve the promise with given value', async () => {
      const deferred = new Deferred<string>()
      const testValue = 'test value'

      deferred.resolve(testValue)
      const result = await deferred.promise

      expect(result).toBe(testValue)
      expect(deferred.isResolved).toBe(true)
      expect(deferred.isRejected).toBe(false)
      expect(deferred.isSettled).toBe(true)
    })

    it('should throw error if already resolved', () => {
      const deferred = new Deferred<string>()

      deferred.resolve('test')

      expect(() => {
        deferred.resolve('test2')
      }).toThrow('Deferred promise has already been resolved or rejected')
    })

    it('should throw error if already rejected', async () => {
      const deferred = new Deferred<string>()

      deferred.reject(new Error('test error'))

      // Catch the rejection to avoid unhandled promise rejection
      try {
        await deferred.promise
      } catch (error) {
        // Expected to fail
      }

      expect(() => {
        deferred.resolve('test')
      }).toThrow('Deferred promise has already been resolved or rejected')
    })
  })

  describe('reject', () => {
    it('should reject the promise with given reason', async () => {
      const deferred = new Deferred<string>()
      const testError = new Error('test error')

      deferred.reject(testError)

      await expect(deferred.promise).rejects.toThrow('test error')
      expect(deferred.isResolved).toBe(false)
      expect(deferred.isRejected).toBe(true)
      expect(deferred.isSettled).toBe(true)
    })

    it('should reject with string reason', async () => {
      const deferred = new Deferred<string>()

      deferred.reject('string error')

      try {
        await deferred.promise
        expect.fail('Should have rejected')
      } catch (error) {
        expect(error).toBe('string error')
      }
    })

    it('should throw error if already resolved', () => {
      const deferred = new Deferred<string>()

      deferred.resolve('test')

      expect(() => {
        deferred.reject(new Error('test error'))
      }).toThrow('Deferred promise has already been resolved or rejected')
    })

    it('should throw error if already rejected', async () => {
      const deferred = new Deferred<string>()

      deferred.reject(new Error('first error'))

      // Catch the rejection to avoid unhandled promise rejection
      try {
        await deferred.promise
      } catch (error) {
        // Expected to fail
      }

      expect(() => {
        deferred.reject(new Error('second error'))
      }).toThrow('Deferred promise has already been resolved or rejected')
    })
  })

  describe('status getters', () => {
    it('should return correct status for unresolved promise', () => {
      const deferred = new Deferred<string>()

      expect(deferred.isResolved).toBe(false)
      expect(deferred.isRejected).toBe(false)
      expect(deferred.isSettled).toBe(false)
    })

    it('should return correct status after resolve', () => {
      const deferred = new Deferred<string>()

      deferred.resolve('test')

      expect(deferred.isResolved).toBe(true)
      expect(deferred.isRejected).toBe(false)
      expect(deferred.isSettled).toBe(true)
    })

    it('should return correct status after reject', async () => {
      const deferred = new Deferred<string>()

      deferred.reject(new Error('test'))

      // Catch the rejection to avoid unhandled promise rejection
      try {
        await deferred.promise
      } catch (error) {
        // Expected to fail
      }

      expect(deferred.isResolved).toBe(false)
      expect(deferred.isRejected).toBe(true)
      expect(deferred.isSettled).toBe(true)
    })
  })
})

describe('createDeferred', () => {
  it('should create a new Deferred instance', () => {
    const deferred = createDeferred<string>()

    expect(deferred).toBeInstanceOf(Deferred)
    expect(deferred.promise).toBeInstanceOf(Promise)
  })

  it('should create independent instances', () => {
    const deferred1 = createDeferred<string>()
    const deferred2 = createDeferred<string>()

    expect(deferred1).not.toBe(deferred2)
    expect(deferred1.promise).not.toBe(deferred2.promise)
  })
})
