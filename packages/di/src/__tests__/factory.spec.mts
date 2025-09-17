import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Factory } from '../decorators/index.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { Container, Registry } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'

describe('Factory decorator', () => {
  let container: Container
  beforeEach(() => {
    container = new Container()
  })
  it('should work with factory', async () => {
    @Factory()
    class Test {
      create() {
        return 'foo'
      }
    }

    const value = await container.get(Test)
    expect(value).toBe('foo')
  })

  it('should work with request scope', async () => {
    @Factory({
      scope: InjectableScope.Transient,
    })
    class Test {
      create() {
        return Date.now()
      }
    }

    const value = await container.get(Test)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const value2 = await container.get(Test)
    expect(value).not.toBe(value2)
  })

  it('should work with factory injection token and schema', async () => {
    class TestFoo {
      constructor(public readonly foo: string) {}
    }
    const token = InjectionToken.create(
      TestFoo,
      z.object({
        foo: z.string(),
      }),
    )

    @Factory({ token })
    // oxlint-disable-next-line no-unused-vars
    class Test {
      create(ctx: any, args: { foo: string }) {
        return new TestFoo(args.foo)
      }
    }

    const value = await container.get(token, { foo: 'bar' })
    const sameValue = await container.get(token, { foo: 'bar' })
    const differentValue = await container.get(token, { foo: 'baz' })
    // await new Promise((resolve) => setTimeout(resolve, 10))
    expect(value).toBeInstanceOf(TestFoo)
    expect(value.foo).toBe('bar')
    expect(differentValue).toBeInstanceOf(TestFoo)
    expect(differentValue.foo).toBe('baz')
    expect(value).not.toBe(differentValue)
    expect(value).toBe(sameValue)
  })

  it('should work with factory and inner inject', async () => {
    @Factory()
    class TestFactory {
      create() {
        return {
          makeFoo: () => 'foo',
        }
      }
    }

    @Factory()
    class Test2Factory {
      create() {
        return {
          async makeFoo() {
            const instance = await container.get(TestFactory)
            return instance.makeFoo()
          },
        }
      }
    }

    const instance = await container.get(Test2Factory)
    const result = await instance.makeFoo()
    expect(result).toBe('foo')
  })

  it('should work with factory and custom registry', async () => {
    const registry = new Registry()
    const newContainer = new Container(registry)

    @Factory({ registry })
    class TestFactory {
      create() {
        return 'custom-registry-foo'
      }
    }

    const value = await newContainer.get(TestFactory)
    expect(value).toBe('custom-registry-foo')
  })

  it('should work with factory and invalidation', async () => {
    @Factory()
    class TestFactory {
      create() {
        return Date.now()
      }
    }

    const factory = await container.get(TestFactory)
    const result1 = factory
    const inst2 = await container.get(TestFactory)
    expect(factory).toBe(inst2)
    const result2 = inst2
    await container.invalidate(factory)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const inst3 = await container.get(TestFactory)
    expect(factory).not.toBe(inst3)
    const result3 = inst3
    expect(result1).not.toBe(result3)
    expect(result2).not.toBe(result3)
    expect(result1).toBe(result2)
  })
})
