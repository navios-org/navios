import { describe, expect, it, vi } from 'vitest'

import { EventEmitter } from '../event-emitter.mjs'

describe('EventEmitter', () => {
  it('should create an instance', () => {
    const emitter = new EventEmitter()
    expect(emitter).toBeDefined()
  })

  it('should add and trigger event listeners', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    emitter.on('test', mockListener)
    await emitter.emit('test', 'hello')

    expect(mockListener).toHaveBeenCalledWith('hello')
    expect(mockListener).toHaveBeenCalledTimes(1)
    emitter.off('test', mockListener)
  })

  it('should support multiple listeners for the same event', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener1 = vi.fn()
    const mockListener2 = vi.fn()

    emitter.on('test', mockListener1)
    emitter.on('test', mockListener2)
    await emitter.emit('test', 'hello')

    expect(mockListener1).toHaveBeenCalledWith('hello')
    expect(mockListener2).toHaveBeenCalledWith('hello')
  })

  it('should return unsubscribe function from on()', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    const unsubscribe = emitter.on('test', mockListener)
    await emitter.emit('test', 'hello1')

    unsubscribe()
    await emitter.emit('test', 'hello2')

    expect(mockListener).toHaveBeenCalledTimes(1)
    expect(mockListener).toHaveBeenCalledWith('hello1')
  })

  it('should support off() method to remove listeners', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    emitter.on('test', mockListener)
    await emitter.emit('test', 'hello1')

    emitter.off('test', mockListener)
    await emitter.emit('test', 'hello2')

    expect(mockListener).toHaveBeenCalledTimes(1)
    expect(mockListener).toHaveBeenCalledWith('hello1')
  })

  it('should handle off() for non-existent event', () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    expect(() => {
      emitter.off('test', mockListener)
    }).not.toThrow()
  })

  it('should clean up empty listener sets after removing all listeners', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener1 = vi.fn()
    const mockListener2 = vi.fn()

    emitter.on('test', mockListener1)
    emitter.on('test', mockListener2)

    emitter.off('test', mockListener1)
    emitter.off('test', mockListener2)

    // After removing all listeners, emitting should not call anything
    await emitter.emit('test', 'hello')

    expect(mockListener1).not.toHaveBeenCalled()
    expect(mockListener2).not.toHaveBeenCalled()
  })

  it('should support once() method for one-time listeners', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    emitter.once('test', mockListener)
    await emitter.emit('test', 'hello1')
    await emitter.emit('test', 'hello2')

    expect(mockListener).toHaveBeenCalledTimes(1)
    expect(mockListener).toHaveBeenCalledWith('hello1')
  })

  it('should return unsubscribe function from once()', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockListener = vi.fn()

    const unsubscribe = emitter.once('test', mockListener)
    unsubscribe() // Remove before emitting
    await emitter.emit('test', 'hello')

    expect(mockListener).not.toHaveBeenCalled()
  })

  it('should handle emit() for non-existent event', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()

    const result = await emitter.emit('test', 'hello')
    expect(result).toBeUndefined()
  })

  it('should handle multiple arguments in events', async () => {
    const emitter = new EventEmitter<{ test: [string, number, boolean] }>()
    const mockListener = vi.fn()

    emitter.on('test', mockListener)
    await emitter.emit('test', 'hello', 42, true)

    expect(mockListener).toHaveBeenCalledWith('hello', 42, true)
  })

  it('should handle async listeners', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockAsyncListener = vi.fn().mockResolvedValue('async result')

    emitter.on('test', mockAsyncListener)
    const results = await emitter.emit('test', 'hello')

    expect(mockAsyncListener).toHaveBeenCalledWith('hello')
    expect(results).toEqual(['async result'])
  })

  it('should handle multiple async listeners and return all results', async () => {
    const emitter = new EventEmitter<{ test: [string] }>()
    const mockAsyncListener1 = vi.fn().mockResolvedValue('result1')
    const mockAsyncListener2 = vi.fn().mockResolvedValue('result2')

    emitter.on('test', mockAsyncListener1)
    emitter.on('test', mockAsyncListener2)
    const results = await emitter.emit('test', 'hello')

    expect(results).toEqual(['result1', 'result2'])
  })

  it('should work with no-argument events', async () => {
    const emitter = new EventEmitter<{ test: [] }>()
    const mockListener = vi.fn()

    emitter.on('test', mockListener)
    await emitter.emit('test')

    expect(mockListener).toHaveBeenCalledWith()
  })
})
