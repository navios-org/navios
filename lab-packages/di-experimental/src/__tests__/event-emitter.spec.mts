import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Container } from '../container/container.mjs'
import { EventEmitter } from '../event-emitter.mjs'

describe('EventEmitter', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('basic operations', () => {
    it('should be injectable as transient', async () => {
      const emitter1 = await container.get(EventEmitter)
      const emitter2 = await container.get(EventEmitter)

      expect(emitter1).toBeInstanceOf(EventEmitter)
      expect(emitter2).toBeInstanceOf(EventEmitter)
      expect(emitter1).not.toBe(emitter2)
    })
  })

  describe('on', () => {
    it('should register event listener', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      emitter.on('test', listener)
      await emitter.emit('test')

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      const unsubscribe = emitter.on('test', listener)
      unsubscribe()

      await emitter.emit('test')
      expect(listener).not.toHaveBeenCalled()
    })

    it('should support multiple listeners for same event', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      emitter.on('test', listener1)
      emitter.on('test', listener2)
      await emitter.emit('test')

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('should support different event types', async () => {
      const emitter = await container.get(
        EventEmitter<{ eventA: []; eventB: [] }>,
      )
      const listenerA = vi.fn()
      const listenerB = vi.fn()

      emitter.on('eventA', listenerA)
      emitter.on('eventB', listenerB)

      await emitter.emit('eventA')

      expect(listenerA).toHaveBeenCalledTimes(1)
      expect(listenerB).not.toHaveBeenCalled()
    })
  })

  describe('off', () => {
    it('should remove specific listener', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      emitter.on('test', listener1)
      emitter.on('test', listener2)
      emitter.off('test', listener1)

      await emitter.emit('test')

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('should handle removing non-existent listener gracefully', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      // Should not throw
      emitter.off('test', listener)
    })

    it('should handle removing from non-existent event gracefully', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      // Should not throw
      emitter.off('test', () => {})
    })

    it('should clean up empty event sets', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      emitter.on('test', listener)
      emitter.off('test', listener)

      // After removing the last listener, the event should be cleaned up
      // We can verify this by checking that emit doesn't call anything
      await emitter.emit('test')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('once', () => {
    it('should only trigger listener once', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      emitter.once('test', listener)

      await emitter.emit('test')
      await emitter.emit('test')
      await emitter.emit('test')

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const listener = vi.fn()

      const unsubscribe = emitter.once('test', listener)
      unsubscribe()

      await emitter.emit('test')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('emit', () => {
    it('should pass arguments to listeners', async () => {
      const emitter = await container.get(
        EventEmitter<{ test: [string, number] }>,
      )
      const listener = vi.fn()

      emitter.on('test', listener)
      await emitter.emit('test', 'hello', 42)

      expect(listener).toHaveBeenCalledWith('hello', 42)
    })

    it('should return undefined for non-existent event', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      const result = await emitter.emit('test')
      expect(result).toBeUndefined()
    })

    it('should wait for async listeners', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      let completed = false

      emitter.on('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        completed = true
      })

      await emitter.emit('test')
      expect(completed).toBe(true)
    })

    it('should execute all listeners concurrently', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)
      const order: number[] = []

      emitter.on('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        order.push(1)
      })

      emitter.on('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push(2)
      })

      emitter.on('test', async () => {
        order.push(3)
      })

      await emitter.emit('test')

      // All should complete, but order depends on timing
      expect(order).toHaveLength(3)
      // The sync one should complete first
      expect(order[0]).toBe(3)
    })

    it('should return array of results from Promise.all', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      // @ts-expect-error - not a documented feature
      emitter.on('test', async () => 'result1')
      // @ts-expect-error - not a documented feature
      emitter.on('test', async () => 'result2')

      const results = await emitter.emit('test')
      expect(results).toEqual(['result1', 'result2'])
    })
  })

  describe('type safety', () => {
    it('should enforce correct event argument types', async () => {
      type Events = {
        userCreated: [string, number]
        orderPlaced: [{ id: string; total: number }]
        empty: []
      }

      const emitter = await container.get(EventEmitter<Events>)
      const userListener = vi.fn()
      const orderListener = vi.fn()
      const emptyListener = vi.fn()

      emitter.on('userCreated', userListener)
      emitter.on('orderPlaced', orderListener)
      emitter.on('empty', emptyListener)

      await emitter.emit('userCreated', 'user123', 25)
      await emitter.emit('orderPlaced', { id: 'order1', total: 100 })
      await emitter.emit('empty')

      expect(userListener).toHaveBeenCalledWith('user123', 25)
      expect(orderListener).toHaveBeenCalledWith({ id: 'order1', total: 100 })
      expect(emptyListener).toHaveBeenCalledWith()
    })
  })

  describe('error handling', () => {
    it('should propagate errors from sync listeners', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      emitter.on('test', () => {
        throw new Error('Sync error')
      })

      await expect(emitter.emit('test')).rejects.toThrow('Sync error')
    })

    it('should propagate errors from async listeners', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      emitter.on('test', async () => {
        throw new Error('Async error')
      })

      await expect(emitter.emit('test')).rejects.toThrow('Async error')
    })
  })

  describe('memory management', () => {
    it('should allow garbage collection after unsubscribe', async () => {
      const emitter = await container.get(EventEmitter<{ test: [] }>)

      // Add and remove many listeners
      for (let i = 0; i < 100; i++) {
        const unsubscribe = emitter.on('test', () => {})
        unsubscribe()
      }

      // The event should be cleaned up (empty listeners set removed)
      await emitter.emit('test')
    })
  })
})
