import { describe, expect, it } from 'vitest'

import { Injectable, InjectableScope, InjectionToken } from '../index.mjs'
import { getInjectors } from '../utils/get-injectors.mjs'

@Injectable({ scope: InjectableScope.Singleton })
class TestService {
  constructor() {}
}

describe('getInjectors', () => {
  it('should return injectors object with correct methods', () => {
    const injectors = getInjectors()

    expect(injectors).toBeDefined()
    expect(typeof injectors.inject).toBe('function')
    expect(typeof injectors.asyncInject).toBe('function')
    expect(typeof injectors.wrapSyncInit).toBe('function')
    expect(typeof injectors.provideFactoryContext).toBe('function')
  })

  it('should handle wrapSyncInit with simple function', () => {
    const injectors = getInjectors()

    const testFn = () => 'test result'
    const wrappedFn = injectors.wrapSyncInit(testFn)

    const result = wrappedFn()
    expect(result).toHaveLength(3) // [result, promises, injectState]
    expect(result[0]).toBe('test result')
    expect(result[1]).toEqual([]) // no promises
  })

  it('should handle inject method when called outside context', () => {
    const injectors = getInjectors()

    // This should throw when called outside of injection context
    expect(() => injectors.inject(TestService)).toThrow()
  })

  it('should handle asyncInject method when called outside context', async () => {
    const injectors = getInjectors()
    const testToken = new InjectionToken<string>('TestToken', undefined)

    // This should throw since we're calling outside of an injectable context
    try {
      await injectors.asyncInject(testToken)
      expect.fail('Should have thrown an error')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(
        '[Injector] Trying to access inject outside of a injectable context',
      )
    }
  })

  it('should handle provideFactoryContext without context', () => {
    const injectors = getInjectors()

    const mockContext = {
      inject: injectors.asyncInject,
      locator: {} as any,
      addDestroyListener: () => {},
    }

    // This should work but not have much effect without a real context
    const result = injectors.provideFactoryContext(mockContext)
    expect(result).toBeNull()
  })
})
