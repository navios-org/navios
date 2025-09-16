import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { Factorable, FactorableWithArgs } from '../interfaces/index.mjs'

import { Factory, Injectable } from '../decorators/index.mjs'
import { globalRegistry } from '../index.mjs'
import { InjectionToken } from '../injection-token.mjs'
import { dangerouslySetGlobalFactoryContext, inject } from '../injector.mjs'
import { ServiceLocator } from '../service-locator.mjs'

describe('InjectToken', () => {
  let serviceLocator: ServiceLocator
  beforeEach(() => {
    serviceLocator = new ServiceLocator(globalRegistry, console)
    dangerouslySetGlobalFactoryContext(serviceLocator)
  })
  it('should work with class', async () => {
    const token = InjectionToken.create('Test')
    @Injectable({
      token,
    })
    class Test {}

    const value = await inject(Test)
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
    const value = await inject(token, {
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

    const value = await inject(Test)
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
    class Test implements FactorableWithArgs<string, typeof schema> {
      async create(ctx: any, args: { test: string }) {
        return args.test
      }
    }
    const value = await inject(token, {
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
    const value = await inject(boundToken)

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
    const value = await inject(factoryInjectionToken)

    expect(value).toBeInstanceOf(Test)
  })
})
