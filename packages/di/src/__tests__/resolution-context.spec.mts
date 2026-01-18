import { describe, expect, it, vi } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import {
  getCurrentResolutionContext,
  withoutResolutionContext,
  withResolutionContext,
} from '../internal/context/resolution-context.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'

import type { InstanceHolder } from '../internal/holder/instance-holder.mjs'

function createMockHolder(name: string): InstanceHolder {
  return {
    status: InstanceStatus.Creating,
    name,
    instance: null,
    creationPromise: Promise.resolve([undefined, {}]) as any,
    destroyPromise: null,
    type: InjectableType.Class,
    scope: InjectableScope.Singleton,
    deps: new Set(),
    destroyListeners: [],
    createdAt: Date.now(),
    waitingFor: new Set(),
  }
}

describe('ResolutionContext', () => {
  describe('withResolutionContext', () => {
    it('should run function within context', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      const result = withResolutionContext(holder, getHolder, () => {
        return 'result'
      })

      expect(result).toBe('result')
    })

    it('should make context available via getCurrentResolutionContext', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      withResolutionContext(holder, getHolder, () => {
        const ctx = getCurrentResolutionContext()
        expect(ctx).toBeDefined()
        expect(ctx?.waiterHolder).toBe(holder)
        expect(ctx?.getHolder).toBe(getHolder)
      })
    })

    it('should properly nest contexts', () => {
      const outerHolder = createMockHolder('OuterService')
      const innerHolder = createMockHolder('InnerService')
      const getHolder = vi.fn()

      withResolutionContext(outerHolder, getHolder, () => {
        const outerCtx = getCurrentResolutionContext()
        expect(outerCtx?.waiterHolder.name).toBe('OuterService')

        withResolutionContext(innerHolder, getHolder, () => {
          const innerCtx = getCurrentResolutionContext()
          expect(innerCtx?.waiterHolder.name).toBe('InnerService')
        })

        // After inner context, we should still have outer context
        // (AsyncLocalStorage automatically restores)
        const restoredCtx = getCurrentResolutionContext()
        expect(restoredCtx?.waiterHolder.name).toBe('OuterService')
      })
    })

    it('should handle async operations', async () => {
      const holder = createMockHolder('AsyncService')
      const getHolder = vi.fn()

      await withResolutionContext(holder, getHolder, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))

        const ctx = getCurrentResolutionContext()
        expect(ctx?.waiterHolder.name).toBe('AsyncService')
      })
    })

    it('should propagate errors', () => {
      const holder = createMockHolder('ErrorService')
      const getHolder = vi.fn()

      expect(() => {
        withResolutionContext(holder, getHolder, () => {
          throw new Error('Test error')
        })
      }).toThrow('Test error')
    })

    it('should return function result', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      const result = withResolutionContext(holder, getHolder, () => {
        return { data: 'test', value: 42 }
      })

      expect(result).toEqual({ data: 'test', value: 42 })
    })
  })

  describe('getCurrentResolutionContext', () => {
    it('should return context data inside withResolutionContext', () => {
      const holder = createMockHolder('TestService')
      // oxlint-disable-next-line no-unused-vars
      const getHolder = (name: string) => undefined

      withResolutionContext(holder, getHolder, () => {
        const ctx = getCurrentResolutionContext()

        expect(ctx).toBeDefined()
        expect(ctx?.waiterHolder).toBe(holder)
        expect(typeof ctx?.getHolder).toBe('function')
      })
    })
  })

  describe('withoutResolutionContext', () => {
    it('should clear context within callback', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      withResolutionContext(holder, getHolder, () => {
        // Inside context
        expect(getCurrentResolutionContext()?.waiterHolder).toBe(holder)

        withoutResolutionContext(() => {
          // Context should be cleared (undefined)
          const ctx = getCurrentResolutionContext()
          expect(ctx).toBeUndefined()
        })

        // After withoutResolutionContext, original context should be restored
        expect(getCurrentResolutionContext()?.waiterHolder).toBe(holder)
      })
    })

    it('should return function result', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      const result = withResolutionContext(holder, getHolder, () => {
        return withoutResolutionContext(() => {
          return 'inner-result'
        })
      })

      expect(result).toBe('inner-result')
    })

    it('should handle async operations', async () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      await withResolutionContext(holder, getHolder, async () => {
        await withoutResolutionContext(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          const ctx = getCurrentResolutionContext()
          expect(ctx).toBeUndefined()
        })

        // Context should be restored after async withoutResolutionContext
        expect(getCurrentResolutionContext()?.waiterHolder).toBe(holder)
      })
    })
  })

  describe('getHolder function usage', () => {
    it('should allow context to lookup holders by name', () => {
      const holderA = createMockHolder('ServiceA')
      const holderB = createMockHolder('ServiceB')
      const holders = new Map([
        ['ServiceA', holderA],
        ['ServiceB', holderB],
      ])

      const getHolder = (name: string) => holders.get(name)

      withResolutionContext(holderA, getHolder, () => {
        const ctx = getCurrentResolutionContext()

        const foundA = ctx?.getHolder('ServiceA')
        const foundB = ctx?.getHolder('ServiceB')
        const notFound = ctx?.getHolder('NonExistent')

        expect(foundA).toBe(holderA)
        expect(foundB).toBe(holderB)
        expect(notFound).toBeUndefined()
      })
    })
  })

  describe('concurrent contexts', () => {
    it('should isolate contexts between concurrent operations', async () => {
      const holder1 = createMockHolder('Service1')
      const holder2 = createMockHolder('Service2')
      const getHolder = vi.fn()

      const results: string[] = []

      await Promise.all([
        withResolutionContext(holder1, getHolder, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          const ctx = getCurrentResolutionContext()
          results.push(`1: ${ctx?.waiterHolder.name}`)
        }),
        withResolutionContext(holder2, getHolder, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          const ctx = getCurrentResolutionContext()
          results.push(`2: ${ctx?.waiterHolder.name}`)
        }),
      ])

      // Each context should maintain its own holder
      expect(results).toContain('1: Service1')
      expect(results).toContain('2: Service2')
    })
  })

  describe('ResolutionContextData interface', () => {
    it('should provide waiterHolder property', () => {
      const holder = createMockHolder('TestService')
      const getHolder = vi.fn()

      withResolutionContext(holder, getHolder, () => {
        const ctx = getCurrentResolutionContext()

        expect(ctx?.waiterHolder).toBeDefined()
        expect(ctx?.waiterHolder.name).toBe('TestService')
        expect(ctx?.waiterHolder.status).toBe(InstanceStatus.Creating)
      })
    })

    it('should provide getHolder function', () => {
      const holder = createMockHolder('TestService')
      const mockGetHolder = vi.fn().mockReturnValue(holder)

      withResolutionContext(holder, mockGetHolder, () => {
        const ctx = getCurrentResolutionContext()

        ctx?.getHolder('TestService')

        expect(mockGetHolder).toHaveBeenCalledWith('TestService')
      })
    })
  })
})
