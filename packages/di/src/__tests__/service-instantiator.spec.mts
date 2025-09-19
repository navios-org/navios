import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FactoryContext } from '../factory-context.mjs'
import type { FactoryRecord } from '../registry.mjs'
import type { Injectors } from '../utils/get-injectors.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { ServiceInstantiator } from '../service-instantiator.mjs'

// Mock classes for testing
class TestService {
  constructor(public name: string = 'default') {}
}

class TestServiceWithLifecycle {
  public initCalled = false
  public destroyCalled = false

  async onServiceInit() {
    this.initCalled = true
  }

  async onServiceDestroy() {
    this.destroyCalled = true
  }
}

class TestFactory {
  async create(ctx: FactoryContext, args?: any) {
    return { factoryResult: args?.value || 'default' }
  }
}

class TestFactoryWithoutCreate {
  // Missing create method
}

describe('ServiceInstantiator', () => {
  let instantiator: ServiceInstantiator
  let mockInjectors: Injectors
  let mockContext: FactoryContext
  let mockAddDestroyListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockAddDestroyListener = vi.fn()

    mockInjectors = {
      wrapSyncInit: vi.fn((fn) => {
        // Simple mock implementation that just calls the function
        return () => [fn(), [], null]
      }),
      provideFactoryContext: vi.fn((ctx) => ctx),
    } as any

    mockContext = {
      inject: vi.fn(),
      locator: {} as any,
      addDestroyListener: mockAddDestroyListener,
    }

    instantiator = new ServiceInstantiator(mockInjectors)
  })

  function createFactoryRecord<T>(
    target: any,
    type: InjectableType,
    scope: InjectableScope = InjectableScope.Singleton,
  ): FactoryRecord<T, any> {
    const token = new InjectionToken<T, any>('test-token', undefined)
    return {
      type,
      target,
      scope,
      originalToken: token,
    }
  }

  describe('instantiateService', () => {
    it('should instantiate class-based service', async () => {
      const record = createFactoryRecord<TestService>(
        TestService,
        InjectableType.Class,
      )

      const result = await instantiator.instantiateService(
        mockContext,
        record,
        'test-name',
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBeInstanceOf(TestService)
      expect((result[1] as TestService).name).toBe('test-name')
    })

    it('should instantiate factory-based service', async () => {
      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(
        mockContext,
        record,
        { value: 'test' },
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toEqual({ factoryResult: 'test' })
    })

    it('should handle unknown service type', async () => {
      const record: FactoryRecord<any, any> = {
        type: 'Unknown' as any,
        target: TestService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toContain('Unknown service type: Unknown')
    })

    it('should handle errors during instantiation', async () => {
      const ThrowingService = class {
        constructor() {
          throw new Error('Constructor error')
        }
      }

      const record: FactoryRecord<any, any> = {
        type: InjectableType.Class,
        target: ThrowingService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toBe('Constructor error')
    })
  })

  describe('instantiateClass', () => {
    it('should handle class with no arguments', async () => {
      const record: FactoryRecord<TestService, any> = {
        type: InjectableType.Class,
        target: TestService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBeInstanceOf(TestService)
      expect((result[1] as TestService).name).toBe('default')
    })

    it('should handle class with lifecycle hooks', async () => {
      const record: FactoryRecord<TestServiceWithLifecycle, any> = {
        type: InjectableType.Class,
        target: TestServiceWithLifecycle,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()

      const instance = result[1] as TestServiceWithLifecycle
      expect(instance.initCalled).toBe(true)
      expect(mockAddDestroyListener).toHaveBeenCalled()

      // Test destroy listener
      const destroyListener = mockAddDestroyListener.mock.calls[0][0]
      await destroyListener()
      expect(instance.destroyCalled).toBe(true)
    })

    it('should handle wrapSyncInit with promises', async () => {
      // Mock wrapSyncInit to simulate async dependencies
      // @ts-expect-error Test
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return (injectState?: any) => {
          if (!injectState) {
            // First call - return promises
            return [fn(), [Promise.resolve('async-dep')], 'inject-state']
          } else {
            // Second call - no more promises
            return [fn(), [], null]
          }
        }
      })

      const record: FactoryRecord<TestService, any> = {
        type: InjectableType.Class,
        target: TestService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBeInstanceOf(TestService)
    })

    it('should handle failed async dependencies', async () => {
      // @ts-expect-error Test
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return () => [fn(), [Promise.reject(new Error('Async error'))], null]
      })

      const record: FactoryRecord<TestService, any> = {
        type: InjectableType.Class,
        target: TestService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toContain('cannot be instantiated')
    })

    it('should handle persistent promises after retry', async () => {
      let callCount = 0
      // Always return promises to simulate problematic definition
      // @ts-expect-error Test
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return (injectState?: any) => {
          callCount++
          // Always return promises to simulate problematic definition
          return [fn(), [Promise.resolve('persistent-promise')], 'state']
        }
      })

      // Mock console.error to capture the warning
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const record: FactoryRecord<TestService, any> = {
        type: InjectableType.Class,
        target: TestService,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toContain('cannot be instantiated')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("has problem with it's definition"),
      )

      consoleSpy.mockRestore()
    })
  })

  describe('instantiateFactory', () => {
    it('should handle factory with no arguments', async () => {
      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toEqual({ factoryResult: 'default' })
    })

    it('should handle factory without create method', async () => {
      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactoryWithoutCreate,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toContain(
        'does not implement the create method',
      )
    })

    it('should handle factory with promises', async () => {
      // @ts-expect-error Test
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return (injectState?: any) => {
          if (!injectState) {
            return [fn(), [Promise.resolve('async-dep')], 'inject-state']
          } else {
            return [fn(), [], null]
          }
        }
      })

      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toEqual({ factoryResult: 'default' })
    })

    it('should handle failed async dependencies in factory', async () => {
      // @ts-expect-error Test
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return () => [
          fn(),
          [Promise.reject(new Error('Factory async error'))],
          null,
        ]
      })

      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toContain('cannot be instantiated')
    })

    it('should handle persistent promises in factory', async () => {
      // @ts-expect-error
      mockInjectors.wrapSyncInit = vi.fn((fn) => {
        return () => [fn(), [Promise.resolve('persistent')], 'state']
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: TestFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('asyncInject instead of inject'),
      )

      consoleSpy.mockRestore()
    })

    it('should handle factory create method that throws', async () => {
      class ThrowingFactory {
        async create() {
          throw new Error('Factory create error')
        }
      }

      const record: FactoryRecord<any, any> = {
        type: InjectableType.Factory,
        target: ThrowingFactory,
        scope: InjectableScope.Singleton,
        originalToken: 'test' as any,
      }

      const result = await instantiator.instantiateService(mockContext, record)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(Error)
      expect(result[0]!.message).toBe('Factory create error')
    })
  })
})
