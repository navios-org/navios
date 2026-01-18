import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { FactoryContext } from '../internal/context/factory-context.mjs'

describe('InjectionToken', () => {
  describe('constructor', () => {
    it('should create token with string name', () => {
      const token = new InjectionToken('TestToken', undefined)

      expect(token.name).toBe('TestToken')
      expect(token.schema).toBeUndefined()
    })

    it('should create token with symbol name', () => {
      const sym = Symbol('TestSymbol')
      const token = new InjectionToken(sym, undefined)

      expect(token.name).toBe(sym)
    })

    it('should create token with class name', () => {
      class TestClass {}
      const token = new InjectionToken(TestClass, undefined)

      expect(token.name).toBe(TestClass)
    })

    it('should create token with schema', () => {
      const schema = z.object({ name: z.string() })
      const token = new InjectionToken('TestToken', schema)

      expect(token.schema).toBe(schema)
    })

    it('should generate deterministic id', () => {
      const token1 = InjectionToken.create<string>('TestToken')
      const token2 = InjectionToken.create<string>('TestToken')

      expect(token1.id).toBe(token2.id)
    })

    it('should generate different ids for different names', () => {
      const token1 = InjectionToken.create<string>('TokenA')
      const token2 = InjectionToken.create<string>('TokenB')

      expect(token1.id).not.toBe(token2.id)
    })

    it('should use custom id when provided', () => {
      const token = new InjectionToken('TestToken', undefined, 'custom-id')

      expect(token.id).toBe('custom-id')
    })
  })

  describe('static create', () => {
    it('should create token with string name', () => {
      const token = InjectionToken.create<string>('TestToken')

      expect(token).toBeInstanceOf(InjectionToken)
      expect(token.name).toBe('TestToken')
    })

    it('should create token with symbol name', () => {
      const sym = Symbol('test')
      const token = InjectionToken.create<string>(sym)

      expect(token.name).toBe(sym)
    })

    it('should create token with class', () => {
      class TestService {}
      const token = InjectionToken.create(TestService)

      expect(token.name).toBe(TestService)
    })

    it('should create token with schema', () => {
      const schema = z.object({ id: z.number() })
      const token = InjectionToken.create<{ data: string }, typeof schema>('TestToken', schema)

      expect(token.schema).toBe(schema)
    })
  })

  describe('static bound', () => {
    it('should create BoundInjectionToken', () => {
      const schema = z.object({ value: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)

      const bound = InjectionToken.bound(token, { value: 'test' })

      expect(bound).toBeInstanceOf(BoundInjectionToken)
      expect(bound.token).toBe(token)
      expect(bound.value).toEqual({ value: 'test' })
    })
  })

  describe('static factory', () => {
    it('should create FactoryInjectionToken', () => {
      const schema = z.object({ value: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = async () => ({ value: 'factory' })

      const factoryToken = InjectionToken.factory(token, factory)

      expect(factoryToken).toBeInstanceOf(FactoryInjectionToken)
      expect(factoryToken.token).toBe(token)
      expect(factoryToken.factory).toBe(factory)
    })
  })

  describe('static refineType', () => {
    it('should refine bound token type', () => {
      const schema = z.object({ value: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const bound = new BoundInjectionToken(token, { value: 'test' })

      const refined = InjectionToken.refineType<number>(bound)

      expect(refined).toBe(bound)
    })
  })

  describe('toString', () => {
    it('should format string name with id', () => {
      const token = InjectionToken.create<string>('TestToken')

      const str = token.toString()

      expect(str).toMatch(/TestToken\([^)]+\)/)
    })

    it('should format symbol name with id', () => {
      const sym = Symbol('TestSymbol')
      const token = InjectionToken.create<string>(sym)

      const str = token.toString()

      expect(str).toMatch(/Symbol\(TestSymbol\)\([^)]+\)/)
    })

    it('should format class name with id', () => {
      class TestClass {}
      const token = InjectionToken.create(TestClass)

      const str = token.toString()

      expect(str).toMatch(/TestClass\([^)]+\)/)
    })

    it('should cache formatted name', () => {
      const token = InjectionToken.create<string>('TestToken')

      const str1 = token.toString()
      const str2 = token.toString()

      expect(str1).toBe(str2)
    })
  })
})

describe('BoundInjectionToken', () => {
  describe('constructor', () => {
    it('should wrap token with value', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)

      const bound = new BoundInjectionToken(token, { config: 'value' })

      expect(bound.token).toBe(token)
      expect(bound.value).toEqual({ config: 'value' })
    })

    it('should copy properties from wrapped token', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)

      const bound = new BoundInjectionToken(token, { config: 'value' })

      expect(bound.id).toBe(token.id)
      expect(bound.name).toBe(token.name)
      expect(bound.schema).toBe(token.schema)
    })
  })

  describe('toString', () => {
    it('should delegate to wrapped token', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const bound = new BoundInjectionToken(token, { config: 'value' })

      expect(bound.toString()).toBe(token.toString())
    })
  })
})

describe('FactoryInjectionToken', () => {
  describe('constructor', () => {
    it('should wrap token with factory function', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = async () => ({ config: 'factory' })

      const factoryToken = new FactoryInjectionToken(token, factory)

      expect(factoryToken.token).toBe(token)
      expect(factoryToken.factory).toBe(factory)
      expect(factoryToken.resolved).toBe(false)
      expect(factoryToken.value).toBeUndefined()
    })

    it('should copy properties from wrapped token', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = async () => ({ config: 'factory' })

      const factoryToken = new FactoryInjectionToken(token, factory)

      expect(factoryToken.id).toBe(token.id)
      expect(factoryToken.name).toBe(token.name)
      expect(factoryToken.schema).toBe(token.schema)
    })
  })

  describe('resolve', () => {
    it('should call factory and store value', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = vi.fn(async () => ({ config: 'resolved' }))
      const factoryToken = new FactoryInjectionToken(token, factory)

      const mockCtx: FactoryContext = {
        inject: vi.fn(),
        container: {} as any,
        addDestroyListener: vi.fn(),
      }

      const result = await factoryToken.resolve(mockCtx)

      expect(result).toEqual({ config: 'resolved' })
      expect(factoryToken.value).toEqual({ config: 'resolved' })
      expect(factoryToken.resolved).toBe(true)
      expect(factory).toHaveBeenCalledWith(mockCtx)
    })

    it('should only call factory once', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = vi.fn(async () => ({ config: 'resolved' }))
      const factoryToken = new FactoryInjectionToken(token, factory)

      const mockCtx: FactoryContext = {
        inject: vi.fn(),
        container: {} as any,
        addDestroyListener: vi.fn(),
      }

      await factoryToken.resolve(mockCtx)
      await factoryToken.resolve(mockCtx)
      await factoryToken.resolve(mockCtx)

      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('should return cached value on subsequent calls', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      let callCount = 0
      const factory = async () => ({ config: `call-${++callCount}` })
      const factoryToken = new FactoryInjectionToken(token, factory)

      const mockCtx: FactoryContext = {
        inject: vi.fn(),
        container: {} as any,
        addDestroyListener: vi.fn(),
      }

      const result1 = await factoryToken.resolve(mockCtx)
      const result2 = await factoryToken.resolve(mockCtx)

      expect(result1).toEqual({ config: 'call-1' })
      expect(result2).toEqual({ config: 'call-1' })
    })

    it('should allow factory to use inject', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)

      const factory = async (ctx: FactoryContext) => {
        await ctx.inject(InjectionToken.create<string>('Dependency'))
        return { config: 'with-dep' }
      }

      const factoryToken = new FactoryInjectionToken(token, factory)
      const mockInject = vi.fn().mockResolvedValue('dep-value')
      const mockCtx: FactoryContext = {
        inject: mockInject,
        container: {} as any,
        addDestroyListener: vi.fn(),
      }

      await factoryToken.resolve(mockCtx)

      expect(mockInject).toHaveBeenCalled()
    })
  })

  describe('toString', () => {
    it('should delegate to wrapped token', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = async () => ({ config: 'factory' })
      const factoryToken = new FactoryInjectionToken(token, factory)

      expect(factoryToken.toString()).toBe(token.toString())
    })
  })
})

describe('token identity', () => {
  it('should maintain token reference through wrapping', () => {
    const schema = z.object({ value: z.string() })
    const original = InjectionToken.create<string, typeof schema>('TestToken', schema)

    const bound = new BoundInjectionToken(original, { value: 'test' })
    const factory = new FactoryInjectionToken(original, async () => ({
      value: 'test',
    }))

    expect(bound.token).toBe(original)
    expect(factory.token).toBe(original)
    expect(bound.id).toBe(original.id)
    expect(factory.id).toBe(original.id)
  })
})
