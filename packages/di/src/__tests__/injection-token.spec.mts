import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { Container } from '../container/container.mjs'
import { Injectable } from '../decorators/injectable.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import type { FactoryContext } from '../provider/factory-context.mjs'

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
    it('should format string name', () => {
      const token = InjectionToken.create<string>('TestToken')

      const str = token.toString()

      expect(str).toBe('TestToken')
    })

    it('should format symbol name', () => {
      const sym = Symbol('TestSymbol')
      const token = InjectionToken.create<string>(sym)

      const str = token.toString()

      expect(str).toBe('Symbol(TestSymbol)')
    })

    it('should format class name', () => {
      class TestClass {}
      const token = InjectionToken.create(TestClass)

      const str = token.toString()

      expect(str).toBe('TestClass')
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
    })

    it('should copy properties from wrapped token', () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<string, typeof schema>('TestToken', schema)
      const factory = async () => ({ config: 'factory' })

      const factoryToken = new FactoryInjectionToken(token, factory)

      expect(factoryToken.name).toBe(token.name)
      expect(factoryToken.schema).toBe(token.schema)
    })
  })

  describe('resolution through a container', () => {
    let container: Container

    beforeEach(() => {
      container = new Container()
    })

    afterEach(async () => {
      await container.dispose()
    })

    it('should call factory and pass its value as args', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<{ args: unknown }, typeof schema>('TestToken', schema)

      @Injectable({ token })
      class ConfiguredImpl {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      const factory = vi.fn(async (_ctx: FactoryContext) => ({ config: 'resolved' }))
      const factoryToken = new FactoryInjectionToken(token, factory)

      const result = await container.get(factoryToken)

      expect(result).toBeInstanceOf(ConfiguredImpl)
      expect(result.args).toEqual({ config: 'resolved' })
      expect(factory).toHaveBeenCalledTimes(1)
      const ctx = factory.mock.calls[0][0]
      expect(ctx.container).toBe(container)
      expect(typeof ctx.inject).toBe('function')
      expect(typeof ctx.addDestroyListener).toBe('function')
    })

    it('should only call factory once', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<{ args: unknown }, typeof schema>('TestToken', schema)

      @Injectable({ token, scope: InjectableScope.Transient })
      class Impl {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      const factory = vi.fn(async () => ({ config: 'resolved' }))
      const factoryToken = new FactoryInjectionToken(token, factory)

      await container.get(factoryToken)
      await container.get(factoryToken)
      await container.get(factoryToken)

      expect(Impl).toBeDefined()
      expect(factory).toHaveBeenCalledTimes(1)
    })

    it('should return cached value on subsequent calls', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<{ args: unknown }, typeof schema>('TestToken', schema)

      @Injectable({ token, scope: InjectableScope.Transient })
      class Impl {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      let callCount = 0
      const factory = async () => ({ config: `call-${++callCount}` })
      const factoryToken = new FactoryInjectionToken(token, factory)

      const result1 = await container.get(factoryToken)
      const result2 = await container.get(factoryToken)

      expect(result1).toBeInstanceOf(Impl)
      expect(result1).not.toBe(result2)
      expect(result1.args).toEqual({ config: 'call-1' })
      expect(result2.args).toEqual({ config: 'call-1' })
    })

    it('should allow factory to use inject', async () => {
      const schema = z.object({ config: z.string() })
      const token = InjectionToken.create<{ args: unknown }, typeof schema>('TestToken', schema)
      const dependency = InjectionToken.create<string>('Dependency')
      container.addInstance(dependency, 'dep-value')

      @Injectable({ token })
      class Impl {
        constructor(public readonly args: z.output<typeof schema>) {}
      }

      const factory = async (ctx: FactoryContext) => {
        const dep = await ctx.inject<string>(dependency)
        return { config: `with-${dep}` }
      }

      const factoryToken = new FactoryInjectionToken(token, factory)

      const result = await container.get(factoryToken)

      expect(result).toBeInstanceOf(Impl)
      expect(result.args).toEqual({ config: 'with-dep-value' })
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
  })
})
