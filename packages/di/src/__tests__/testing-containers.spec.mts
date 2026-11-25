import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  registerProvider,
} from '../index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

import type { OnServiceDestroy } from '../index.mjs'

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('UnitTestContainer', () => {
  describe('call tracking', () => {
    @Injectable()
    class Service {
      async load(id: number) {
        await tick()
        return id
      }

      fail(): Promise<void> {
        return Promise.reject(new Error('failed'))
      }

      never() {
        return new Promise<void>(() => {})
      }
    }

    it('records concurrent first calls', async () => {
      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      const service = await unit.get(Service)
      await Promise.all([service.load(1), service.load(2), service.load(3)])
      unit.expectCallCount(Service, 'load', 3)
      unit.expectCalledWith(Service, 'load', [1])
      expect(unit.getMethodCalls(Service).map((call) => call.result)).toEqual([1, 2, 3])
      await unit.dispose()
    })

    it('records a call when it is made', async () => {
      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      const service = await unit.get(Service)
      void service.never()
      unit.expectCalled(Service, 'never')
      await expect(service.fail()).rejects.toThrow('failed')
      expect(unit.getMethodCalls(Service)[1].error?.message).toBe('failed')
      await unit.dispose()
    })

    it('works in a scope, where a request-scoped class can only be resolved', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Handler {
        handle() {}
      }

      const unit = new UnitTestContainer({ providers: [{ token: Handler }] })
      const scope = unit.createScope()
      const handler = await scope.get(Handler)
      handler.handle()
      unit.expectCallCount(Handler, 'handle', 1)
      expect(scope.getSync(Handler)).toBe(handler)
      await expect(scope.get(Service)).rejects.toMatchObject({
        code: DIErrorCode.ProviderNotFound,
      })
      await scope.invalidate(handler)
      expect(await scope.get(Handler)).not.toBe(handler)
      await scope.dispose()
      await unit.dispose()
    })

    it('compares args of any kind', async () => {
      class Money {
        #value: number

        constructor(value: number) {
          this.#value = value
        }

        toJSON() {
          return this.#value
        }
      }
      class Secret {
        #value: number

        constructor(value: number) {
          this.#value = value
        }

        read() {
          return this.#value
        }
      }
      class Point {
        x = 1
      }
      const cyclic = (a: number) => {
        const object: Record<string, unknown> = { a }
        object.self = object
        return object
      }
      const secret = new Secret(1)
      const bytes = new Uint8Array([1, 2])
      const same: [unknown[], unknown[]][] = [
        [[new URL('http://a/')], [new URL('http://a')]],
        [[new Money(1)], [new Money(1)]],
        [[secret], [secret]],
        [[new Point()], [new Point()]],
        [[new Point()], [{ x: 1 }]],
        [[new Date(1)], [new Date(1)]],
        [[/a/g], [/a/g]],
        [[bytes], [new Uint8Array([1, 2])]],
        [[bytes.buffer], [new Uint8Array([1, 2]).buffer]],
        [[new Error('a')], [new Error('a')]],
        [[new URLSearchParams('a=1')], [new URLSearchParams('a=1')]],
        [[new Map([[{ a: 1 }, [2]]])], [new Map([[{ a: 1 }, [2]]])]],
        [[new Set([1, 2])], [new Set([2, 1])]],
        [[cyclic(1)], [cyclic(1)]],
        [[Object.assign(Object.create(null), { a: 1 })], [{ a: 1 }]],
        [[{ a: 1, b: undefined }], [{ a: 1 }]],
        [
          [NaN, -0],
          [NaN, -0],
        ],
      ]
      const different: [unknown[], unknown[]][] = [
        [[new URL('http://a/')], [new URL('http://b/')]],
        [[new Money(1)], [new Money(2)]],
        [[new Secret(1)], [new Secret(1)]],
        [[new Point()], [{ x: 2 }]],
        [[new Money(1)], [{}]],
        [[new Date(1)], [new Date(2)]],
        [[new Date(1)], [{}]],
        [[{}], [new Date(1)]],
        [[/a/g], [/a/i]],
        [[bytes], [[1, 2]]],
        [[bytes], [new Uint8Array([1, 3])]],
        [[bytes], [new Uint16Array([1, 2])]],
        [[bytes.buffer], [new ArrayBuffer(2)]],
        [[new Error('a')], [new Error('b')]],
        [[new Error('a')], [new TypeError('a')]],
        [[new URLSearchParams('a=1')], [new URLSearchParams('a=2')]],
        [[new Map([[1, 2]])], [{}]],
        [[new Map([[1, 2]])], [new Map([[1, 3]])]],
        [[new Set([1])], [new Set([1, 2])]],
        [[cyclic(1)], [cyclic(2)]],
        [[['a'].concat()], [['a', undefined]]],
        [['a', undefined], ['a']],
        [['a'], ['a', undefined]],
        [[0], [-0]],
        [[null], [undefined]],
      ]
      const check = async (called: unknown[], expected: unknown[]) => {
        const unit = new UnitTestContainer({ providers: [{ token: Service }] })
        const service: any = await unit.get(Service)
        void service.load(...called)
        unit.expectCalledWith(Service, 'load', expected)
        await unit.dispose()
      }
      for (const [called, expected] of same) {
        await check(called, expected)
      }
      for (const [called, expected] of different) {
        await expect(check(called, expected)).rejects.toThrow('to be called with')
      }
    })

    it('compares args by value', async () => {
      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      const service: any = await unit.get(Service)
      await service.load({ map: new Map([[1, 2]]), missing: undefined })
      unit.expectCalledWith(Service, 'load', [{ map: new Map([[1, 2]]) }])
      for (const other of [
        { map: new Map([[9, 9]]) },
        { map: new Map([[1, 2]]), missing: 1 },
        [new Map([[1, 2]])],
      ]) {
        expect(() => unit.expectCalledWith(Service, 'load', [other])).toThrow('to be called with')
      }
      await unit.dispose()
    })
  })

  describe('the proxy', () => {
    it('keeps spies and the identity of methods', async () => {
      const MAILER = InjectionToken.create<{ send: (to: string) => void }>('Mailer')
      const mailer = { send: vi.fn() }
      const unit = new UnitTestContainer({ providers: [{ token: MAILER, useValue: mailer }] })
      const proxy = await unit.get(MAILER)
      proxy.send('a')
      expect(proxy.send).toHaveBeenCalledWith('a')
      expect(mailer.send).toHaveBeenCalledTimes(1)
      expect(proxy.send).toBe(proxy.send)
      unit.expectCalledWith(MAILER, 'send', ['a'])
      await unit.dispose()
    })

    it('copes with frozen values and with classes as properties', async () => {
      const FROZEN = InjectionToken.create<{ a: () => number }>('frozen')
      const MODELS = InjectionToken.create<{ Model: new () => { x: number } }>('models')

      class Model {
        x = 1
      }

      const unit = new UnitTestContainer({
        providers: [
          { token: FROZEN, useValue: Object.freeze({ a: () => 1 }) },
          { token: MODELS, useValue: { Model } },
        ],
      })
      expect((await unit.get(FROZEN)).a()).toBe(1)
      const models = await unit.get(MODELS)
      expect(new models.Model().x).toBe(1)
      await unit.dispose()
    })

    it('reaches private members from accessors and symbol methods', async () => {
      @Injectable()
      class Counter {
        #values = [1, 2]

        get first() {
          return this.#values[0]
        }

        set first(value: number) {
          this.#values[0] = value
        }

        *[Symbol.iterator]() {
          yield* this.#values
        }
      }

      const MAP = InjectionToken.create<Map<string, number>>('map')
      const unit = new UnitTestContainer({
        providers: [{ token: Counter }, { token: MAP, useValue: new Map([['a', 1]]) }],
      })
      const counter = await unit.get(Counter)
      counter.first = 5
      expect(counter.first).toBe(5)
      expect([...counter]).toEqual([5, 2])
      expect([...(await unit.get(MAP))]).toEqual([['a', 1]])
      await unit.dispose()
    })

    it('stands for its instance in invalidate()', async () => {
      const destroyed = vi.fn()

      @Injectable()
      class Service implements OnServiceDestroy {
        onServiceDestroy() {
          destroyed()
        }
      }

      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      await unit.invalidate(await unit.get(Service))
      expect(destroyed).toHaveBeenCalledTimes(1)
      await unit.dispose()
    })
  })

  describe('registered tokens', () => {
    it('are those of provide() and addInstance() as well', async () => {
      @Injectable()
      class Service {
        x = 1
      }

      const TOKEN = InjectionToken.create<number>('token')
      const unit = new UnitTestContainer({ providers: [] })
      await expect(unit.get(Service)).rejects.toMatchObject({ code: DIErrorCode.ProviderNotFound })
      unit.provide(Service, Service)
      unit.addInstance(TOKEN, 1)
      expect(unit.isRegistered(Service)).toBe(true)
      expect((await unit.get(Service)).x).toBe(1)
      expect(await unit.get(TOKEN)).toBe(1)
      expect(await unit.get(Container)).toBe(unit)
      await unit.dispose()
    })
  })

  describe('providers', () => {
    it('give a factory the context and the args', async () => {
      const schema = z.object({ id: z.number() })
      const TOKEN = InjectionToken.create<string, typeof schema>('token', schema)
      const PREFIX = InjectionToken.create<string>('prefix')
      const unit = new UnitTestContainer({
        providers: [
          { token: PREFIX, useValue: 'p' },
          {
            token: TOKEN,
            useFactory: async (ctx, args) => `${await ctx.inject(PREFIX)}${args.id}`,
          },
        ],
      })
      expect(await unit.get(TOKEN, { id: 1 })).toBe('p1')
      await unit.dispose()
    })

    it('do not hide a scope error', async () => {
      @Injectable({ scope: InjectableScope.Request })
      class Request {}

      @Injectable()
      class Single {
        readonly request = inject(Request)
      }

      const value = new Request()
      const unit = new UnitTestContainer({
        providers: [{ token: Request, useValue: value }, { token: Single }],
      })
      await expect(unit.get(Single)).rejects.toMatchObject({
        code: DIErrorCode.ScopeMismatchError,
      })
      const scope = unit.createScope()
      await expect(scope.get(Request)).resolves.toBeInstanceOf(Request)
      await unit.dispose()
    })
  })
})

describe('TestContainer', () => {
  describe('bind(token).toValue() of a request-scoped token', () => {
    @Injectable({ scope: InjectableScope.Request })
    class Request {
      v = 'real'
    }

    @Injectable()
    class Single {
      readonly request = inject(Request)
    }

    it('serves scopes, before and after clear(), and never the root', async () => {
      const test = new TestContainer()
      const value = { v: 'mock' }
      test.bind(Request).toValue(value)

      for (let round = 0; round < 2; round++) {
        const scope = test.createScope()
        expect(await scope.get(Request)).toBe(value)
        for (const token of [Request, Single]) {
          await expect(test.get(token as typeof Single)).rejects.toMatchObject({
            code: DIErrorCode.ScopeMismatchError,
          })
        }
        await scope.dispose()
        await test.clear()
      }
      await test.dispose()
    })

    it('leaves what an open scope already holds', async () => {
      const test = new TestContainer()
      const scope = test.createScope()
      const real = await scope.get(Request)
      test.bind(Request).toValue({ v: 'mock' })
      expect(await scope.get(Request)).toBe(real)
      await scope.dispose()
      await test.dispose()
    })
  })

  describe('an alias', () => {
    @Injectable()
    class Ses {
      real = true
    }

    const MAILER = InjectionToken.create<{ real: boolean }>('Mailer')
    registerProvider(MAILER, { existing: Ses })
    const ALIAS = InjectionToken.create<{ real: boolean }>('Alias')
    registerProvider(ALIAS, { existing: MAILER })

    @Injectable()
    class Consumer {
      readonly mailer = inject(ALIAS)
    }

    @Injectable({ scope: InjectableScope.Request })
    class Handler {
      readonly consumer = inject(Consumer)
    }

    it.each([MAILER, ALIAS])('can be bound again after it was used (%s)', async (token) => {
      const test = new TestContainer()
      const ses = await test.get(Ses)
      expect((await test.get(Consumer)).mailer).toBe(ses)

      test.bind(token).toValue({ real: false })
      expect((await test.get(Consumer)).mailer.real).toBe(false)

      test.bind(token).toClass(
        class Fake {
          real = false
          fake = true
        },
      )
      expect((await test.get(Consumer)).mailer).toHaveProperty('fake')
      // What it pointed to goes on.
      expect(await test.get(Ses)).toBe(ses)
      await test.dispose()
    })

    it('that nobody asked for is bound without touching what it points to', async () => {
      const destroyed = vi.fn()

      @Injectable()
      class Other implements OnServiceDestroy {
        readonly ses = inject(Ses)

        onServiceDestroy() {
          destroyed()
        }
      }

      const test = new TestContainer()
      await test.get(Other)
      test.bind(MAILER).toValue({ real: false })
      expect(destroyed).not.toHaveBeenCalled()
      await test.dispose()
    })

    it('reaches a dependent that is still being built, and one in a scope', async () => {
      let init = () => {}
      const initialised = new Promise<void>((resolve) => {
        init = resolve
      })

      @Injectable()
      class Slow {
        readonly mailer = inject(MAILER)

        async onServiceInit() {
          await initialised
        }
      }

      const test = new TestContainer()
      const scope = test.createScope()
      expect((await scope.get(Handler)).consumer.mailer.real).toBe(true)
      const slow = test.get(Slow)
      test.bind(MAILER).toValue({ real: false })
      init()
      expect((await slow).mailer.real).toBe(false)
      expect((await scope.get(Handler)).consumer.mailer.real).toBe(false)
      await scope.dispose()
      await test.dispose()
    })

    it('is resolved once it was asked for', async () => {
      const test = new TestContainer()
      await test.get(Ses)
      for (const token of [MAILER, ALIAS]) {
        test.expectNotResolved(token)
        expect(() => test.expectResolved(token)).toThrow('to be resolved')
      }
      await test.get(Consumer)
      for (const token of [MAILER, ALIAS]) {
        test.expectResolved(token)
        expect(() => test.expectNotResolved(token)).toThrow('NOT be resolved')
      }
      await test.clear()
      await test.get(Ses)
      test.expectNotResolved(MAILER)
      await test.dispose()

      const unit = new UnitTestContainer({ providers: [{ token: Ses }, { token: Consumer }] })
      unit.provide(ALIAS, { existing: Ses })
      unit.expectNotResolved(ALIAS)
      await unit.get(Consumer)
      unit.expectResolved(ALIAS)
      await unit.dispose()
    })
  })

  it('gives a bound factory the context and the args', async () => {
    const schema = z.object({ id: z.number() })
    const TOKEN = InjectionToken.create<string, typeof schema>('token', schema)
    const test = new TestContainer()
    test.bind(TOKEN).toFactory(async (ctx, args) => {
      const container = await ctx.inject(Container)
      return `${container === test} ${args.id}`
    })
    expect(await test.get(TOKEN, { id: 2 })).toBe('true 2')
    await test.dispose()
  })
})
