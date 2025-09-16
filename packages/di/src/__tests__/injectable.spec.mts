import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { Container, globalRegistry, InjectableScope, Registry, ServiceLocator, syncInject } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { dangerouslySetGlobalFactoryContext, inject } from '../injector.mjs'
import { getInjectableToken } from '../utils/index.mjs'

describe('Injectable decorator', () => {
  let container: Container
  beforeEach(() => {
    container = new Container()
  })
  it('should work with class', async () => {
    @Injectable()
    class Test {}

    const value = await container.get(Test)
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

    const value = await container.get(Test2)
    expect(value).toBeInstanceOf(Test2)
    const result = await value.makeFoo()
    expect(result).toBe('foo')
  })


  it('should work with injection token', async () => {
    const token = InjectionToken.create('Test')

    @Injectable({ token })
    class Test {}

    const value = await container.get(token)
    expect(value).toBeInstanceOf(Test)
  })

  it('should work with invalidation', async () => {
    @Injectable({ scope: InjectableScope.Transient })
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
    const inst1 = await container.get(Test2)
    expect(inst1).toBeInstanceOf(Test2)
    const result1 = await inst1.makeFoo()
    const inst2 = await container.get(Test2)
    expect(inst1).toBe(inst2)
    const result2 = await inst2.makeFoo()
    await container.invalidate(inst1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const inst3 = await container.get(Test2)
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
    const inst1 = await container.get(Test2)
    expect(inst1).toBeInstanceOf(Test2)
    const result1 = inst1.makeFoo()
    const inst2 = await container.get(Test2)
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

    const value = await container.get(token, { foo: 'bar' })
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

    const value = await container.get(boundToken)
    expect(value).toBeInstanceOf(Test)
  })

  it('should work with bound injection token and custom registry', async () => {
    const registry = new Registry()
    const newContainer = new Container(registry, console)
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

    const value = await newContainer.get(TestOuter)
    expect(value).toBeInstanceOf(TestOuter)
    expect(value.foo).toBeInstanceOf(TestInner)
  })
})
