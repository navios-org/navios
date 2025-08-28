import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { Registry, ServiceLocator, syncInject } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { getGlobalServiceLocator, inject } from '../injector.mjs'
import { getInjectableToken, getInjectors } from '../utils/index.mjs'

describe('Injectable decorator', () => {
  it('should work with class', async () => {
    @Injectable()
    class Test {}

    const value = await inject(Test)
    expect(value).toBeInstanceOf(Test)
  })

  it('should work with inner inject', async () => {
    @Injectable()
    class Test {
      makeFoo() {
        return 'foo'
      }
    }

    @Injectable()
    class Test2 {
      fooMaker = inject(Test)

      async makeFoo() {
        const fooMaker = await this.fooMaker
        return fooMaker.makeFoo()
      }
    }

    const value = await inject(Test2)
    expect(value).toBeInstanceOf(Test2)
    const result = await value.makeFoo()
    expect(result).toBe('foo')
  })

  it('should work with factory', async () => {
    @Injectable({ type: InjectableType.Factory })
    class Test {
      create() {
        return 'foo'
      }
    }

    const value = await inject(Test)
    expect(value).toBe('foo')
  })
  it('should work with request scope', async () => {
    @Injectable({
      scope: InjectableScope.Instance,
      type: InjectableType.Factory,
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

  it('should work with injection token', async () => {
    const token = InjectionToken.create('Test')

    @Injectable({ token })
    class Test {}

    const value = await inject(token)
    expect(value).toBeInstanceOf(Test)
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

    @Injectable({ token, type: InjectableType.Factory })
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
  it('should work with invalidation', async () => {
    @Injectable()
    class Test {
      value = Date.now()
    }

    @Injectable()
    class Test2 {
      test = inject(Test)

      async makeFoo() {
        const test = await this.test
        return test.value
      }
    }
    const identifier = getGlobalServiceLocator().getInstanceIdentifier(
      getInjectableToken(Test),
      undefined,
    )
    const inst1 = await inject(Test2)
    expect(inst1).toBeInstanceOf(Test2)
    const result1 = await inst1.makeFoo()
    const inst2 = await inject(Test2)
    expect(inst1).toBe(inst2)
    const result2 = await inst2.makeFoo()
    await getGlobalServiceLocator().invalidate(identifier)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const inst3 = await inject(Test2)
    expect(inst1).not.toBe(inst3)
    const result3 = await inst3.makeFoo()
    expect(result1).not.toBe(result3)
    expect(result2).not.toBe(result3)
    expect(result1).toBe(result2)
  })

  it('should work with syncInject', async () => {
    @Injectable()
    class Test {
      value = Date.now()
    }

    @Injectable()
    class Test2 {
      test = syncInject(Test)

      makeFoo() {
        return this.test.value
      }
    }
    const inst1 = await inject(Test2)
    expect(inst1).toBeInstanceOf(Test2)
    const result1 = inst1.makeFoo()
    const inst2 = await inject(Test2)
    expect(inst1).toBe(inst2)
    const result2 = await inst2.makeFoo()
    expect(result1).toBe(result2)
  })

  it('should work with constructor argument', async () => {
    const schema = z.object({
      foo: z.string(),
    })

    const token = InjectionToken.create('Test', schema)

    @Injectable({ token })
    class Test {
      constructor(public readonly arg: z.output<typeof schema>) {}
    }

    const value = await inject(token, { foo: 'bar' })
    expect(value).toBeInstanceOf(Test)
    // @ts-expect-error It's a test
    expect(value.arg).toEqual({ foo: 'bar' })
  })

  it('should work with bound injection token', async () => {
    const schema = z.object({
      foo: z.string(),
    })
    const token = InjectionToken.create('Test', schema)

    @Injectable({ token })
    class Test {}

    const boundToken = InjectionToken.bound(token, {
      foo: 'bar',
    })

    const value = await inject(boundToken)
    expect(value).toBeInstanceOf(Test)
  })

  it('should work with bound injection token', async () => {
    const registry = new Registry()
    const newServiceLocator = new ServiceLocator(registry)
    const { inject, syncInject } = getInjectors({
      baseLocator: newServiceLocator,
    })
    const schema = z.object({
      foo: z.string(),
    })
    const token = InjectionToken.create('TestInner', schema)
    @Injectable({ token, registry })
    class TestInner {}

    const boundToken = InjectionToken.bound(token, {
      foo: 'bar',
    })

    @Injectable({ registry })
    class TestOuter {
      foo = syncInject(boundToken)
    }

    const value = await inject(TestOuter)
    expect(value).toBeInstanceOf(TestOuter)
    expect(value.foo).toBeInstanceOf(TestInner)
  })
})
