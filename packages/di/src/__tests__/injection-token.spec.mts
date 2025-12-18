import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'

import { Factory, Injectable } from '../decorators/index.mjs'
import { Container } from '../index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

describe('InjectToken', () => {
  let container: Container
  beforeEach(() => {
    container = new Container()
  })
  it('should work with class', async () => {
    const token = InjectionToken.create('Test')
    @Injectable({
      token,
    })
    class Test {}

    const value = await container.get(Test)
    expect(value).toBeInstanceOf(Test)
  })

  it('should work with class and schema', async () => {
    const schema = z.object({
      test: z.string(),
    })
    const token = InjectionToken.create('Test', schema)

    @Injectable({
      token,
    })
    class Test {
      makeFoo() {
        return 'foo'
      }
    }
    const value = await container.get(token, {
      test: 'test',
    })

    expect(value).toBeInstanceOf(Test)
  })

  it('should work with factory', async () => {
    const token = InjectionToken.create<string>('Test')
    @Factory({
      token,
    })
    class Test implements Factorable<string> {
      async create() {
        return 'foo'
      }
    }

    const value = await container.get(Test)
    expect(value).toBe('foo')
  })

  it('should work with factory and schema', async () => {
    const schema = z.object({
      test: z.string(),
    })
    const token = InjectionToken.create<string, typeof schema>('Test', schema)

    @Factory({
      token,
    })
    // oxlint-disable-next-line no-unused-vars
    class Test implements FactorableWithArgs<string, typeof schema> {
      async create(ctx: any, args: { test: string }) {
        return args.test
      }
    }
    const value = await container.get(token, {
      test: 'test',
    })

    expect(value).toBe('test')
  })

  it('should work with bound token', async () => {
    const schema = z.object({
      test: z.string(),
    })
    const token = InjectionToken.create('Test', schema)
    const boundToken = InjectionToken.bound(token, {
      test: 'test',
    })

    @Injectable({
      token,
    })
    class Test {
      makeFoo() {
        return 'foo'
      }
    }
    const value = await container.get(boundToken)

    expect(value).toBeInstanceOf(Test)
  })

  it('should work with factory token', async () => {
    const schema = z.object({
      test: z.string(),
    })
    const token = InjectionToken.create('Test', schema)
    const factoryInjectionToken = InjectionToken.factory(token, () =>
      Promise.resolve({
        test: 'test',
      }),
    )

    @Injectable({
      token,
    })
    class Test {
      makeFoo() {
        return 'foo'
      }
    }
    const value = await container.get(factoryInjectionToken)

    expect(value).toBeInstanceOf(Test)
  })

  describe('Factory Token Resolution', () => {
    it('should resolve factory token only once and cache the result', async () => {
      let resolveCount = 0
      const token = InjectionToken.create<Test>('Test')
      const factoryInjectionToken = InjectionToken.factory(token, () => {
        resolveCount++
        return Promise.resolve({
          value: 'cached-value',
        })
      })

      @Injectable({
        token,
      })
      class Test {
        value = 'test-value'
      }

      // First resolution
      const value1 = await container.get(factoryInjectionToken)
      expect(value1).toBeInstanceOf(Test)
      expect(resolveCount).toBe(1)

      // Second resolution should use cached value
      const value2 = await container.get(factoryInjectionToken)
      expect(value2).toBeInstanceOf(Test)
      expect(resolveCount).toBe(1) // Should not increment
    })

    it('should handle async factory functions', async () => {
      const token = InjectionToken.create<AsyncTest>('AsyncTest')
      const factoryInjectionToken = InjectionToken.factory(token, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          value: 'async-value',
        }
      })

      @Injectable({
        token,
      })
      class AsyncTest {
        value = 'async-test'
      }

      const value = await container.get(factoryInjectionToken)
      expect(value).toBeInstanceOf(AsyncTest)
    })

    it('should handle factory functions that throw errors', async () => {
      const token = InjectionToken.create<ErrorTest>('ErrorTest')
      const factoryInjectionToken = InjectionToken.factory(token, () => {
        throw new Error('Factory error')
      })

      @Injectable({
        token,
      })
      class ErrorTest {
        value = 'error-test'
      }

      await expect(container.get(factoryInjectionToken)).rejects.toThrow(
        'Factory error',
      )
    })

    it('should handle factory functions that return rejected promises', async () => {
      const token = InjectionToken.create<RejectedTest>('RejectedTest')
      const factoryInjectionToken = InjectionToken.factory(token, () => {
        return Promise.reject(new Error('Promise rejection'))
      })

      @Injectable({
        token,
      })
      class RejectedTest {
        value = 'rejected-test'
      }

      await expect(container.get(factoryInjectionToken)).rejects.toThrow(
        'Promise rejection',
      )
    })

    it('should support inject in factory', async () => {
      @Injectable()
      class InjectTest2 {
        value = 'inject-test'
      }

      const token = InjectionToken.create('InjectTest')
      const factoryInjectionToken = InjectionToken.factory(
        token,
        async (ctx) => {
          const injectTest = await ctx.inject(InjectTest2)
          return { value: injectTest.value }
        },
      )

      @Injectable({
        token,
      })
      class InjectTest {
        value = 'inject-test'
      }

      const value = await container.get(factoryInjectionToken)
      expect(value).toBeInstanceOf(InjectTest)
    })
  })

  describe('Factory Token with Different Schema Types', () => {
    it('should work with optional schema', async () => {
      const schema = z
        .object({
          optional: z.string().optional(),
        })
        .optional()
      const token = InjectionToken.create('OptionalTest', schema)
      const factoryInjectionToken = InjectionToken.factory(token, () =>
        Promise.resolve(undefined),
      )

      @Injectable({
        token,
      })
      class OptionalTest {
        value = 'optional-test'
      }

      const value = await container.get(factoryInjectionToken)
      expect(value).toBeInstanceOf(OptionalTest)
    })

    it('should work with record schema', async () => {
      const schema = z.record(z.string(), z.number())
      const token = InjectionToken.create('RecordTest', schema)
      const factoryInjectionToken = InjectionToken.factory(token, () =>
        Promise.resolve({ count: 42, score: 100 }),
      )

      @Injectable({
        token,
      })
      class RecordTest {
        value = 'record-test'
      }

      const value = await container.get(factoryInjectionToken)
      expect(value).toBeInstanceOf(RecordTest)
    })

    it('should work with complex nested schema', async () => {
      const schema = z.object({
        user: z.object({
          id: z.number(),
          name: z.string(),
          preferences: z.object({
            theme: z.enum(['light', 'dark']),
            notifications: z.boolean(),
          }),
        }),
        metadata: z.array(z.string()),
      })
      const token = InjectionToken.create('ComplexTest', schema)
      const factoryInjectionToken = InjectionToken.factory(token, () =>
        Promise.resolve({
          user: {
            id: 1,
            name: 'John Doe',
            preferences: {
              theme: 'dark' as const,
              notifications: true,
            },
          },
          metadata: ['tag1', 'tag2'],
        }),
      )

      @Injectable({
        token,
      })
      class ComplexTest {
        value = 'complex-test'
      }

      const value = await container.get(factoryInjectionToken)
      expect(value).toBeInstanceOf(ComplexTest)
    })
  })

  describe('Factory Token with Multiple Instances', () => {
    it('should create separate instances for different factory tokens', async () => {
      const token1 = InjectionToken.create<Test1>('Test1')
      const token2 = InjectionToken.create<Test2>('Test2')

      const factoryToken1 = InjectionToken.factory(token1, () =>
        Promise.resolve({
          value: 'value1',
        }),
      )
      const factoryToken2 = InjectionToken.factory(token2, () =>
        Promise.resolve({
          value: 'value2',
        }),
      )

      @Injectable({
        token: token1,
      })
      class Test1 {
        value = 'test1'
      }

      @Injectable({
        token: token2,
      })
      class Test2 {
        value = 'test2'
      }

      const value1 = await container.get(factoryToken1)
      const value2 = await container.get(factoryToken2)

      expect(value1).toBeInstanceOf(Test1)
      expect(value2).toBeInstanceOf(Test2)
      expect(value1).not.toBe(value2)
    })

    it('should handle factory tokens with same underlying token but different factories', async () => {
      const token = InjectionToken.create<SharedTest>('SharedTest')

      const factoryToken1 = InjectionToken.factory(token, () =>
        Promise.resolve({
          value: 'factory1',
        }),
      )
      const factoryToken2 = InjectionToken.factory(token, () =>
        Promise.resolve({
          value: 'factory2',
        }),
      )

      @Injectable({
        token,
      })
      class SharedTest {
        value = 'shared-test'
      }

      const value1 = await container.get(factoryToken1)
      const value2 = await container.get(factoryToken2)

      expect(value1).toBeInstanceOf(SharedTest)
      expect(value2).toBeInstanceOf(SharedTest)
    })
  })

  describe('Factory Token Properties', () => {
    it('should have correct properties', () => {
      const token = InjectionToken.create('PropertyTest')
      const factoryInjectionToken = InjectionToken.factory(token, () =>
        Promise.resolve({
          value: 'test',
        }),
      )

      expect(factoryInjectionToken.id).toBe(token.id)
      expect(factoryInjectionToken.name).toBe(token.name)
      expect(factoryInjectionToken.schema).toBe(token.schema)
      expect(factoryInjectionToken.resolved).toBe(false)
      expect(factoryInjectionToken.value).toBeUndefined()
    })

    it('should update resolved property after resolution', async () => {
      const token = InjectionToken.create('ResolvedTest')
      const factoryInjectionToken = InjectionToken.factory(token, () =>
        Promise.resolve({
          value: 'resolved',
        }),
      )

      expect(factoryInjectionToken.resolved).toBe(false)
      expect(factoryInjectionToken.value).toBeUndefined()

      // @ts-expect-error we are not using the context
      await factoryInjectionToken.resolve()

      expect(factoryInjectionToken.resolved).toBe(true)
      expect(factoryInjectionToken.value).toMatchObject({ value: 'resolved' })
    })

    it('should return cached value on subsequent resolve calls', async () => {
      let resolveCount = 0
      const token = InjectionToken.create('CacheTest')
      const factoryInjectionToken = InjectionToken.factory(token, () => {
        resolveCount++
        return Promise.resolve({
          value: 'cached',
        })
      })

      // @ts-expect-error we are not using the context
      const result1 = await factoryInjectionToken.resolve()
      // @ts-expect-error we are not using the context
      const result2 = await factoryInjectionToken.resolve()

      expect(result1).toMatchObject({ value: 'cached' })
      expect(result2).toMatchObject({ value: 'cached' })
      expect(resolveCount).toBe(1)
    })
  })
})
