import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Factory } from '../decorators/index.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { Registry, ServiceLocator, syncInject } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { getGlobalServiceLocator, inject } from '../injector.mjs'
import { getInjectableToken, getInjectors } from '../utils/index.mjs'

describe('Factory decorator', () => {
  it('should work with factory', async () => {
    @Factory()
    class Test {
      create() {
        return 'foo'
      }
    }

    const value = await inject(Test)
    expect(value).toBe('foo')
  })

  it('should work with request scope', async () => {
    @Factory({
      scope: InjectableScope.Instance,
    })
    class Test {
      create() {
        return Date.now()
      }
    }

    const value = await inject(Test)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const value2 = await inject(Test)
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
    class Test {
      create(ctx: any, args: { foo: string }) {
        return new TestFoo(args.foo)
      }
    }

    const value = await inject(token, { foo: 'bar' })
    const differentValue = await inject(token, { foo: 'baz' })
    const sameValue = await inject(token, { foo: 'bar' })
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
            const instance = await inject(TestFactory)
            return instance.makeFoo()
          },
        }
      }
    }

    const instance = await inject(Test2Factory)
    const result = await instance.makeFoo()
    expect(result).toBe('foo')
  })

  it('should work with factory and custom registry', async () => {
    const registry = new Registry()
    const newServiceLocator = new ServiceLocator(registry)
    const { inject } = getInjectors({
      baseLocator: newServiceLocator,
    })

    @Factory({ registry })
    class TestFactory {
      create() {
        return 'custom-registry-foo'
      }
    }

    const value = await inject(TestFactory)
    expect(value).toBe('custom-registry-foo')
  })

  it('should work with factory and invalidation', async () => {
    @Factory()
    class TestFactory {
      create() {
        return Date.now()
      }
    }

    const identifier = getGlobalServiceLocator().getInstanceIdentifier(
      getInjectableToken(TestFactory),
      undefined,
    )
    
    const factory = await inject(TestFactory)
    const result1 = factory
    const inst2 = await inject(TestFactory)
    expect(factory).toBe(inst2)
    const result2 = inst2
    await getGlobalServiceLocator().invalidate(identifier)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const inst3 = await inject(TestFactory)
    expect(factory).not.toBe(inst3)
    const result3 = inst3
    expect(result1).not.toBe(result3)
    expect(result2).not.toBe(result3)
    expect(result1).toBe(result2)
  })
})
