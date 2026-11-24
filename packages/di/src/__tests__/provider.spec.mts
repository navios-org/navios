import { describe, expect, it } from 'vitest'

import { argsKey } from '../internal/args-key.mjs'
import {
  Container,
  DIErrorCode,
  getInjectableToken,
  Injectable,
  InjectableScope,
  InjectionToken,
  provide,
  registerFactory,
  registerInjectable,
  validateSync,
} from '../index.mjs'

import type { StandardSchemaV1 } from '../index.mjs'

function schemaOf<T>(check: (value: unknown) => value is T, async = false): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const result = check(value) ? { value } : { issues: [{ message: 'invalid' }] }
        return async ? Promise.resolve(result) : result
      },
    },
  }
}

describe('argsKey', () => {
  it('ignores key order and distinguishes nested values', () => {
    expect(argsKey({ a: 1, b: { x: 1 } })).toBe(argsKey({ b: { x: 1 }, a: 1 }))
    expect(argsKey({ n: { x: 1 } })).not.toBe(argsKey({ n: { x: 2 } }))
  })

  it('distinguishes types', () => {
    expect(argsKey('1')).not.toBe(argsKey(1))
    expect(argsKey(null)).not.toBe(argsKey(undefined))
    expect(argsKey([1, 2])).not.toBe(argsKey([2, 1]))
    expect(argsKey({ a: undefined })).not.toBe(argsKey({}))
    expect(argsKey('a,b')).not.toBe(argsKey(['a', 'b']))
  })

  it('keys non-plain objects by identity', () => {
    class Thing {}
    const one = new Thing()
    const two = new Thing()
    expect(argsKey({ t: one })).toBe(argsKey({ t: one }))
    expect(argsKey({ t: one })).not.toBe(argsKey({ t: two }))
    const fn = () => {}
    expect(argsKey(fn)).toBe(argsKey(fn))
    expect(argsKey(fn)).not.toBe(argsKey(() => {}))
  })
})

describe('validateSync', () => {
  const isString = (value: unknown): value is string => typeof value === 'string'

  it('returns the validated value', () => {
    expect(validateSync(schemaOf(isString), 'ok', 'T')).toBe('ok')
  })

  it('throws TokenValidationError on issues', () => {
    expect(() => validateSync(schemaOf(isString), 1, 'T')).toThrow(
      expect.objectContaining({ code: DIErrorCode.TokenValidationError }),
    )
  })

  it('rejects a schema that validates asynchronously', () => {
    expect(() => validateSync(schemaOf(isString, true), 'ok', 'T')).toThrow(/synchronously/)
  })
})

describe('tokens and providers', () => {
  it('gives two classes with identical source distinct tokens and instances', async () => {
    function make(tag: string) {
      @Injectable()
      class Service {
        hello() {
          return tag
        }
      }
      return Service
    }

    const A = make('a')
    const B = make('b')
    expect(getInjectableToken(A)).not.toBe(getInjectableToken(B))

    const container = new Container()
    expect((await container.get(A)).hello()).toBe('a')
    expect((await container.get(B)).hello()).toBe('b')
  })

  it('does not treat an undecorated subclass as its parent', async () => {
    @Injectable()
    class Parent {}
    class Child extends Parent {}

    const container = new Container()
    const error = await container.get(Child as any).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.ClassNotInjectable)
  })

  it('sets the default provider of a token and rejects a second, different default', () => {
    const Token = InjectionToken.create<{ id: string }>('Thing')

    @Injectable({ token: Token })
    class First {
      id = 'first'
    }

    expect(Token.provider?.target).toBe(First)
    expect(() => {
      @Injectable({ token: Token })
      class Second {
        id = 'second'
      }
      void Second
    }).toThrow(expect.objectContaining({ code: DIErrorCode.ProviderConflict }))
  })

  it('replaces the default when a class with the same name is registered again', async () => {
    const Token = InjectionToken.create<{ id: string }>('Reloaded')

    function define(id: string) {
      @Injectable({ token: Token })
      class Impl {
        id = id
      }
      return Impl
    }

    define('one')
    define('two')
    expect((await new Container().get(Token)).id).toBe('two')
  })

  it('registers without decorator syntax', async () => {
    class Plain {
      value = 1
    }
    registerInjectable(Plain, { scope: InjectableScope.Transient })

    class PlainFactory {
      create() {
        return { made: true }
      }
    }
    registerFactory(PlainFactory)

    const container = new Container()
    expect(await container.get(Plain)).not.toBe(await container.get(Plain))
    expect(await container.get(PlainFactory)).toEqual({ made: true })
  })

  it('keeps the implementation scope in provide() unless one is given', () => {
    @Injectable()
    class Base {}

    @Injectable({ scope: InjectableScope.Transient })
    class Impl {}

    expect(provide(Base, Impl).record.scope).toBe(InjectableScope.Transient)
    expect(
      provide(Base, { class: Impl, scope: InjectableScope.Request }).record.scope,
    ).toBe(InjectableScope.Request)
    expect(provide(Base, { value: 0 as any }).record.kind).toBe('value')
  })

  it('validates token args with any Standard Schema', async () => {
    const isConfig = (value: unknown): value is { n: number } =>
      typeof value === 'object' && value !== null && typeof (value as any).n === 'number'
    const Token = InjectionToken.create<{ n: number }, StandardSchemaV1<{ n: number }>>(
      'Config',
      schemaOf(isConfig),
    )

    @Injectable({ token: Token })
    class Impl {
      n: number
      constructor(args: { n: number }) {
        this.n = args.n
      }
    }
    void Impl

    const container = new Container()
    expect((await container.get(Token, { n: 3 })).n).toBe(3)
    const error = await container.get(Token, { n: 'x' } as any).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.TokenValidationError)
  })

  it('refuses addInstance for a token whose args are required', () => {
    const isConfig = (value: unknown): value is { n: number } =>
      typeof value === 'object' && value !== null
    const Token = InjectionToken.create<{ n: number }, StandardSchemaV1<{ n: number }>>(
      'Required',
      schemaOf(isConfig),
    )
    const container = new Container()
    expect(() => container.addInstance(Token, { n: 1 })).toThrow(
      expect.objectContaining({ code: DIErrorCode.TokenSchemaRequiredError }),
    )
    container.addInstance(InjectionToken.bound(Token, { n: 1 }), { n: 1 })
    expect(container.tryGetSync(Token, { n: 1 })).toEqual({ n: 1 })
  })
})
