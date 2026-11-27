import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIError,
  Factory,
  Injectable,
  InjectableScope,
  InjectionToken,
  registerFactory,
  registerInjectable,
} from '../index.mjs'
import {
  Factory as LegacyFactory,
  Injectable as LegacyInjectable,
} from '../legacy-compat/index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

interface Bucket {
  name: string
  fake?: boolean
}

describe('alpha.1 audit', () => {
  describe('a binding on a bound token', () => {
    const schema = z.object({ name: z.string() })
    let test: TestContainer

    beforeEach(() => {
      test = new TestContainer({ logger: null })
    })

    afterEach(async () => {
      await test.dispose()
    })

    function bucketToken() {
      const BUCKET = InjectionToken.create<Bucket, typeof schema>('Bucket', schema)

      @Injectable({ token: BUCKET })
      class RealBucket implements Bucket {
        readonly name: string

        constructor(args: z.output<typeof schema>) {
          this.name = args.name
        }
      }

      return { BUCKET, RealBucket, UPLOADS: InjectionToken.bound(BUCKET, { name: 'uploads' }) }
    }

    it('toValue() leaves the other args of the token alone', async () => {
      const { BUCKET, RealBucket, UPLOADS } = bucketToken()
      const fake: Bucket = { name: 'fake', fake: true }

      test.bind(UPLOADS).toValue(fake)

      expect(await test.get(UPLOADS)).toBe(fake)
      expect(await test.get(BUCKET, { name: 'uploads' })).toBe(fake)
      const exports = await test.get(BUCKET, { name: 'exports' })
      expect(exports).toBeInstanceOf(RealBucket)
      expect(exports.name).toBe('exports')
    })

    it('toValue() serves the value again after clear()', async () => {
      const { BUCKET, RealBucket, UPLOADS } = bucketToken()
      const fake: Bucket = { name: 'fake', fake: true }

      test.bind(UPLOADS).toValue(fake)
      await test.clear()

      expect(await test.get(UPLOADS)).toBe(fake)
      expect(await test.get(BUCKET, { name: 'exports' })).toBeInstanceOf(RealBucket)
    })

    it('toClass() leaves the other args of the token alone', async () => {
      const { BUCKET, RealBucket, UPLOADS } = bucketToken()

      class FakeBucket implements Bucket {
        readonly fake = true
        readonly name: string

        constructor(args: z.output<typeof schema>) {
          this.name = args.name
        }
      }

      test.bind(UPLOADS).toClass(FakeBucket)

      const uploads = await test.get(UPLOADS)
      expect(uploads).toBeInstanceOf(FakeBucket)
      expect(uploads.name).toBe('uploads')
      expect(await test.get(BUCKET, { name: 'exports' })).toBeInstanceOf(RealBucket)
    })

    it('toFactory() leaves the other args of the token alone', async () => {
      const { BUCKET, RealBucket, UPLOADS } = bucketToken()

      test.bind(UPLOADS).toFactory((_ctx, args) => ({ name: `made ${args.name}`, fake: true }))

      expect(await test.get(UPLOADS)).toEqual({ name: 'made uploads', fake: true })
      expect(await test.get(BUCKET, { name: 'exports' })).toBeInstanceOf(RealBucket)
    })

    it('replaces only the instance of its args when it is bound again', async () => {
      const { BUCKET, UPLOADS } = bucketToken()
      const exports = await test.get(BUCKET, { name: 'exports' })
      const first: Bucket = { name: 'first' }
      const second: Bucket = { name: 'second' }

      test.bind(UPLOADS).toValue(first)
      expect(await test.get(UPLOADS)).toBe(first)
      test.bind(UPLOADS).toValue(second)

      expect(await test.get(UPLOADS)).toBe(second)
      expect(await test.get(BUCKET, { name: 'exports' })).toBe(exports)
    })

    it('is what a token without a provider resolves to for those args only', async () => {
      const BUCKET = InjectionToken.create<Bucket, typeof schema>('Bucket', schema)
      const UPLOADS = InjectionToken.bound(BUCKET, { name: 'uploads' })
      const fake: Bucket = { name: 'fake' }

      test.bind(UPLOADS).toFactory(() => fake)

      expect(test.isRegistered(UPLOADS)).toBe(true)
      expect(test.getProvider(UPLOADS)?.kind).toBe('function')
      expect(test.isRegistered(BUCKET)).toBe(false)
      expect(await test.get(UPLOADS)).toBe(fake)
      await expect(test.get(BUCKET, { name: 'exports' })).rejects.toThrow(DIError)
    })

    it('useValue and useClass of UnitTestContainer reach only the bound args', async () => {
      const { BUCKET, UPLOADS } = bucketToken()
      const EXPORTS = InjectionToken.bound(BUCKET, { name: 'exports' })
      const fake: Bucket = { name: 'fake', fake: true }

      @Injectable()
      class FakeBucket implements Bucket {
        readonly name = 'fake class'
      }

      const unit = new UnitTestContainer({
        providers: [
          { token: UPLOADS, useValue: fake },
          { token: EXPORTS, useClass: FakeBucket },
        ],
        logger: null,
      })

      expect((await unit.get(UPLOADS)).name).toBe('fake')
      expect((await unit.get(EXPORTS)).name).toBe('fake class')
      expect(unit.isRegistered(UPLOADS)).toBe(true)
      expect(unit.isRegistered(EXPORTS)).toBe(true)
      await expect(unit.get(BUCKET, { name: 'other' })).rejects.toThrow(DIError)
      await unit.dispose()
    })

    it('UnitTestContainer rejects a bound token without a use* option', () => {
      const { UPLOADS } = bucketToken()

      expect(
        () => new UnitTestContainer({ providers: [{ token: UPLOADS }], logger: null }),
      ).toThrow(/Bucket is listed as a bound token without useValue, useClass or useFactory/)
    })
  })

  describe('a value given to a testing container', () => {
    it('toValue() is never destroyed, like provide(token, { value })', async () => {
      const TOKEN = InjectionToken.create<{ onServiceDestroy(): void }>('Value')
      const value = { onServiceDestroy: vi.fn() }
      const test = new TestContainer({ logger: null })

      test.bind(TOKEN).toValue(value)
      expect(await test.get(TOKEN)).toBe(value)
      await test.clear()
      expect(await test.get(TOKEN)).toBe(value)
      test.bind(TOKEN).toValue({ onServiceDestroy: vi.fn() })
      await test.dispose()

      expect(value.onServiceDestroy).not.toHaveBeenCalled()
    })

    it('useValue is never destroyed', async () => {
      const TOKEN = InjectionToken.create<{ onServiceDestroy(): void }>('Value')
      const value = { onServiceDestroy: vi.fn() }
      const unit = new UnitTestContainer({
        providers: [{ token: TOKEN, useValue: value }],
        logger: null,
      })

      await unit.get(TOKEN)
      await unit.clear()
      await unit.get(TOKEN)
      await unit.dispose()

      expect(value.onServiceDestroy).not.toHaveBeenCalled()
    })
  })

  describe('the scope a token declares', () => {
    let container: Container

    beforeEach(() => {
      container = new Container()
    })

    afterEach(async () => {
      await container.dispose()
    })

    it('is the scope of @Injectable({ token })', async () => {
      const TOKEN = InjectionToken.create<object>('PerRequest', { scope: InjectableScope.Request })

      @Injectable({ token: TOKEN })
      class Impl {}

      expect(container.getProvider(TOKEN)?.scope).toBe(InjectableScope.Request)
      const first = container.createScope()
      const second = container.createScope()
      expect(await first.get(TOKEN)).toBeInstanceOf(Impl)
      expect(await first.get(TOKEN)).toBe(await first.get(TOKEN))
      expect(await first.get(TOKEN)).not.toBe(await second.get(TOKEN))
      await first.dispose()
      await second.dispose()
    })

    it('is the scope of @Factory({ token })', async () => {
      const TOKEN = InjectionToken.create<object>('Made', { scope: InjectableScope.Transient })

      @Factory({ token: TOKEN })
      class Maker {
        create() {
          return {}
        }
      }

      expect(Maker).toBeDefined()
      expect(container.getProvider(TOKEN)?.scope).toBe(InjectableScope.Transient)
      expect(await container.get(TOKEN)).not.toBe(await container.get(TOKEN))
    })

    it('yields to an explicit scope option', () => {
      const TOKEN = InjectionToken.create<object>('Explicit', { scope: InjectableScope.Request })
      const MADE = InjectionToken.create<object>('ExplicitMade', {
        scope: InjectableScope.Request,
      })

      @Injectable({ token: TOKEN, scope: InjectableScope.Singleton })
      class Impl {}

      @Factory({ token: MADE, scope: InjectableScope.Singleton })
      class Maker {
        create() {
          return {}
        }
      }

      expect(Impl).toBeDefined()
      expect(Maker).toBeDefined()
      expect(container.getProvider(TOKEN)?.scope).toBe(InjectableScope.Singleton)
      expect(container.getProvider(MADE)?.scope).toBe(InjectableScope.Singleton)
    })

    it('is the scope registerInjectable(), registerFactory() and legacy decorators use', () => {
      const scope = InjectableScope.Request
      const A = InjectionToken.create<object>('A', { scope })
      const B = InjectionToken.create<object>('B', { scope })
      const C = InjectionToken.create<object>('C', { scope })
      const D = InjectionToken.create<object>('D', { scope })

      class ImplA {}
      class ImplB {
        create() {
          return {}
        }
      }
      class ImplC {}
      class ImplD {
        create() {
          return {}
        }
      }
      registerInjectable(ImplA, { token: A })
      registerFactory(ImplB, { token: B })
      LegacyInjectable({ token: C })(ImplC)
      LegacyFactory({ token: D })(ImplD)

      for (const token of [A, B, C, D]) {
        expect(container.getProvider(token)?.scope).toBe(scope)
      }
    })
  })

  describe('an onInvalidate listener that throws during dispose()', () => {
    const schema = z.object({ name: z.string() })

    function setup(container: Container) {
      const released = vi.fn()

      @Injectable()
      class Service {}

      const NAMED = InjectionToken.create<{ args: z.output<typeof schema> }, typeof schema>(
        'Named',
        schema,
      )

      @Injectable({ token: NAMED })
      class Named {
        constructor(readonly args: z.output<typeof schema>) {}
      }

      const COMPUTED = InjectionToken.factory(NAMED, (ctx) => {
        ctx.addDestroyListener(released)
        return { name: 'computed' }
      })
      container.onInvalidate(Service, () => {
        throw new Error('listener failed')
      })
      return { Service, Named, COMPUTED, released }
    }

    it('still runs the destroy listeners of factory tokens', async () => {
      const container = new Container({ logger: null })
      const { Service, COMPUTED, released } = setup(container)
      await container.get(Service)
      await container.get(COMPUTED)

      await expect(container.dispose()).rejects.toThrow('listener failed')

      expect(released).toHaveBeenCalledTimes(1)
    })

    it('does so for clear() of a testing container as well', async () => {
      const test = new TestContainer({ logger: null })
      const { Service, COMPUTED, released } = setup(test)
      await test.get(Service)
      await test.get(COMPUTED)

      await expect(test.clear()).rejects.toThrow('listener failed')

      expect(released).toHaveBeenCalledTimes(1)
      await test.dispose()
    })
  })

  describe('onInvalidate(token, listener)', () => {
    it('listens for the instance without args, on a container and on a scope', async () => {
      const container = new Container()

      @Injectable()
      class Shared {}

      @Injectable({ scope: InjectableScope.Request })
      class PerRequest {}

      const scope = container.createScope()
      const inRoot = vi.fn()
      const inScope = vi.fn()
      const stop = container.onInvalidate(Shared, inRoot)
      scope.onInvalidate(PerRequest, inScope)

      await container.invalidate(await container.get(Shared))
      await scope.invalidate(await scope.get(PerRequest))
      expect(inRoot).toHaveBeenCalledTimes(1)
      expect(inScope).toHaveBeenCalledTimes(1)

      stop()
      await container.invalidate(await container.get(Shared))
      expect(inRoot).toHaveBeenCalledTimes(1)
      await container.dispose()
    })

    it('keeps the form with args', async () => {
      const container = new Container()
      const schema = z.object({ id: z.number() })

      @Injectable({ schema })
      class Keyed {
        constructor(readonly args: z.output<typeof schema>) {}
      }

      const one = vi.fn()
      const two = vi.fn()
      container.onInvalidate(Keyed, { id: 1 }, one)
      container.onInvalidate(Keyed, { id: 2 }, two)

      await container.invalidate(await container.get(Keyed, { id: 1 }))
      await container.get(Keyed, { id: 2 })

      expect(one).toHaveBeenCalledTimes(1)
      expect(two).not.toHaveBeenCalled()
      await container.dispose()
    })

    it('works on the testing containers', async () => {
      @Injectable()
      class Service {}

      const test = new TestContainer()
      const unit = new UnitTestContainer({ providers: [{ token: Service }] })
      const listener = vi.fn()
      test.onInvalidate(Service, listener)
      unit.onInvalidate(Service, listener)

      await test.invalidate(await test.get(Service))
      await unit.invalidate(await unit.get(Service))

      expect(listener).toHaveBeenCalledTimes(2)
      await test.dispose()
      await unit.dispose()
    })
  })
})
