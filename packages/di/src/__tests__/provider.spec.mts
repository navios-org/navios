import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  Container,
  DIErrorCode,
  Factory,
  getInjectableToken,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  provide,
  registerFactory,
  registerInjectable,
} from '../index.mjs'
import { argsKey } from '../internal/args-key.mjs'
import { validateSync } from '../schema/standard-schema.mjs'

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
    expect(argsKey({ a: undefined })).toBe(argsKey({}))
    expect(argsKey({ a: null })).not.toBe(argsKey({}))
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

  it('keeps the scope of the token in provide() unless one is given', () => {
    @Injectable()
    class Base {}

    @Injectable({ scope: InjectableScope.Transient })
    class Impl {}

    const Bare = InjectionToken.create<Impl>('Bare')

    expect(provide(Base, Impl).record.scope).toBe(InjectableScope.Singleton)
    // A token without a default provider or a declared scope takes the scope
    // of the implementation.
    expect(provide(Bare, Impl).record.scope).toBe(InjectableScope.Transient)
    expect(provide(Base, { class: Impl, scope: InjectableScope.Request }).record.scope).toBe(
      InjectableScope.Request,
    )
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
    expect(container.peek(Token, { n: 1 })).toEqual({ n: 1 })
  })
})

describe('factories that inject a service with an asynchronous initialiser', () => {
  let container: Container
  const unhandled: unknown[] = []
  const record = (reason: unknown) => unhandled.push(reason)

  beforeEach(() => {
    unhandled.length = 0
    process.on('unhandledRejection', record)
  })

  afterEach(async () => {
    // Unhandled rejections are reported after the microtask queue has drained.
    await new Promise((resolve) => setTimeout(resolve, 5))
    process.off('unhandledRejection', record)
    expect(unhandled).toEqual([])
    await container.dispose()
  })

  function database() {
    @Injectable()
    class Database {
      connected = false
      async onServiceInit() {
        await new Promise((resolve) => setTimeout(resolve, 1))
        this.connected = true
      }
      query() {
        return this.connected ? 'rows' : 'not connected'
      }
    }
    return Database
  }

  it('runs an async factory function past inject() only once the service is ready', async () => {
    const Database = database()
    const Token = InjectionToken.create<{ rows: string }>('Token')
    let pastInject = 0
    container = new Container({
      providers: [
        provide(Token, {
          factory: async () => {
            const db = inject(Database)
            pastInject++
            return { rows: db.query() }
          },
        }),
      ],
    })
    expect(await container.get(Token)).toEqual({ rows: 'rows' })
    expect(pastInject).toBe(1)
  })

  it('resolves a synchronous factory function that uses the service at once', async () => {
    const Database = database()
    const Token = InjectionToken.create<{ rows: string }>('Token')
    container = new Container({
      providers: [provide(Token, { factory: () => ({ rows: inject(Database).query() }) })],
    })
    expect(await container.get(Token)).toEqual({ rows: 'rows' })
  })

  it('waits for several services one after the other', async () => {
    const First = database()
    const Second = database()
    const Token = InjectionToken.create<string[]>('Token')
    let pastInject = 0
    container = new Container({
      providers: [
        provide(Token, {
          factory: async () => {
            const first = inject(First)
            const second = inject(Second)
            pastInject++
            return [first.query(), second.query()]
          },
        }),
      ],
    })
    expect(await container.get(Token)).toEqual(['rows', 'rows'])
    expect(pastInject).toBe(1)
  })

  it('runs create() of a factory class past inject() only once the service is ready', async () => {
    const Database = database()
    let pastInject = 0

    @Factory()
    class RowsFactory {
      async create() {
        const db = inject(Database)
        pastInject++
        return { rows: db.query() }
      }
    }

    container = new Container()
    expect(await container.get(RowsFactory)).toEqual({ rows: 'rows' })
    expect(pastInject).toBe(1)
  })

  it('still fails with the error of a factory that has nothing to wait for', async () => {
    const Token = InjectionToken.create<string>('Token')
    container = new Container({
      providers: [
        provide(Token, {
          factory: () => {
            throw new Error('broken factory')
          },
        }),
      ],
    })
    await expect(container.get(Token)).rejects.toThrow('broken factory')
  })

  it('fails with the error of the service when the service cannot be initialised', async () => {
    @Injectable()
    class Broken {
      async onServiceInit() {
        throw new Error('no connection')
      }
    }
    const Token = InjectionToken.create<unknown>('Token')
    container = new Container({
      providers: [provide(Token, { factory: async () => inject(Broken) })],
    })
    await expect(container.get(Token)).rejects.toThrow('no connection')
  })
})
