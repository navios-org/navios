import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  Container,
  DIError,
  DIErrorCode,
  Factory,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
  optional,
  provide,
  registerInjectable,
} from '../index.mjs'
import { warnAboutSecondCopy } from '../internal/single-copy.mjs'

import type { StandardSchemaV1 } from '../index.mjs'

const caught = (run: () => unknown): any => {
  try {
    run()
  } catch (error) {
    return error
  }
  return 'nothing thrown'
}

const schemaOf = (validate: (value: unknown) => any): StandardSchemaV1<any, any> => ({
  '~standard': { version: 1, vendor: 'test', validate },
})

describe('errors', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await container.dispose()
  })

  describe('a token nothing provides', () => {
    it('is named with the path that leads to it', async () => {
      const DATABASE = InjectionToken.create<object>('DATABASE')

      @Injectable()
      class Repository {
        readonly db = inject(DATABASE)
      }

      @Injectable()
      class Service {
        readonly repository = inject(Repository)
      }

      const error = await container.get(Service).catch((e) => e)
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.ProviderNotFound)
      expect(error.message).toBe('No provider for DATABASE (Service -> Repository -> DATABASE)')
      expect(error.context).toEqual({ name: 'DATABASE', path: ['Service', 'Repository'] })

      await expect(container.get(DATABASE)).rejects.toThrow(/^No provider for DATABASE$/)
    })
  })

  describe('inject() outside a construction', () => {
    it('says when it can be called and what to use instead', async () => {
      @Injectable()
      class Service {}

      const TOKEN = InjectionToken.create<object>('token')
      container.provide(TOKEN, {
        factory: async () => {
          await Promise.resolve()
          return inject(Service)
        },
      })
      const error = await container.get(TOKEN).catch((e) => e)
      expect(error.code).toBe(DIErrorCode.OutsideInjectionContext)
      expect(error.message).toBe(
        'inject() can only be called synchronously while a class or factory is being built; ' +
          'after an await use ctx.inject()',
      )
    })
  })

  describe('an undefined class or token', () => {
    const undefinedToken = undefined as unknown as InjectionToken<string, undefined>
    const message = /undefined is not an injectable class or token.*circular import/

    it('is a rejection of get(), never a synchronous error', async () => {
      const promise = container.get(undefinedToken)
      await expect(promise).rejects.toBeInstanceOf(DIError)
      await expect(promise).rejects.toThrow(message)
      await expect(container.createScope().get(undefinedToken)).rejects.toThrow(message)
    })

    it('is a DIError everywhere else', async () => {
      for (const use of [
        () => container.getSync(undefinedToken),
        () => container.peek(undefinedToken),
        () => container.isRegistered(undefinedToken),
        () => container.getProvider(undefinedToken),
        () => container.onInvalidate(undefinedToken, undefined, () => {}),
        () => container.addInstance(undefinedToken, 'x'),
        () => container.decorate(undefinedToken, (x) => x),
        () => container.provide(undefinedToken, { value: 'x' }),
        () => provide(undefinedToken, { value: 'x' }),
      ]) {
        const error = caught(use)
        expect(error).toBeInstanceOf(DIError)
        expect(error.message).toMatch(message)
      }

      @Injectable()
      class WithInject {
        readonly x = inject(undefinedToken)
      }

      @Injectable()
      class WithOptional {
        readonly x = optional(undefinedToken)
      }

      await expect(container.get(WithInject)).rejects.toThrow(message)
      await expect(container.get(WithOptional)).rejects.toThrow(message)
    })
  })

  describe('args', () => {
    const schema = z.object({ port: z.number(), db: z.object({ password: z.string().min(50) }) })
    const TOKEN = InjectionToken.create<object, typeof schema>('Settings', schema)
    const secret = { port: 'nope', db: { password: 'hunter2' } } as any

    it('that are invalid are described, issue by issue, without their values', async () => {
      const error = await container.get(TOKEN, secret).catch((e) => e)
      expect(error.code).toBe(DIErrorCode.TokenValidationError)
      expect(error.message).toMatch(/^Invalid args for Settings: port: .+; db\.password: .+$/)
      expect(error.context).toEqual({
        name: 'Settings',
        issues: [
          { path: 'port', message: expect.any(String) },
          { path: 'db.password', message: expect.any(String) },
        ],
      })
      expect(JSON.stringify({ ...error, message: error.message })).not.toContain('hunter2')
    })

    it('that their schema chokes on are a DIError', async () => {
      const throwing = InjectionToken.create<object, StandardSchemaV1>(
        'Throwing',
        schemaOf(() => {
          throw new TypeError('boom')
        }),
      )
      const error = await container.get(throwing, {}).catch((e) => e)
      expect(error).toBeInstanceOf(DIError)
      expect(error.code).toBe(DIErrorCode.TokenValidationError)
      expect(error.cause).toBeInstanceOf(TypeError)
    })

    it('that are validated by anything thenable are refused', async () => {
      const built = vi.fn()
      const thenable = InjectionToken.create<object, StandardSchemaV1>(
        'Thenable',
        schemaOf(() => ({
          // oxlint-disable-next-line unicorn/no-thenable
          then(resolve: (result: unknown) => void) {
            resolve({ issues: [{ message: 'bad' }] })
          },
        })),
      )
      container.provide(thenable, { factory: built })
      await expect(container.get(thenable, {})).rejects.toThrow('synchronously')
      expect(built).not.toHaveBeenCalled()
    })

    it('that contain themselves are a rejection', async () => {
      const ANY = InjectionToken.create<object, StandardSchemaV1>(
        'Any',
        schemaOf((value) => ({ value })),
      )
      container.provide(ANY, { factory: () => ({}) })
      const args: Record<string, unknown> = {}
      args.self = args
      args.again = args
      const promise = container.get(ANY, args)
      await expect(promise).rejects.toBeInstanceOf(DIError)
      await expect(promise).rejects.toThrow('must not contain themselves')

      // The same object twice, side by side, is not a cycle.
      const shared = { id: 1 }
      await expect(container.get(ANY, { a: shared, b: shared })).resolves.toEqual({})
    })
  })

  describe('decorators', () => {
    const legacy = (decorator: unknown) => (decorator as (target: unknown) => unknown)(class {})

    it('explain themselves when a compiler applies them as legacy decorators', () => {
      for (const [name, decorator] of [
        ['Injectable', Injectable()],
        ['Factory', Factory()],
      ] as const) {
        const error = caught(() => legacy(decorator))
        expect(error).toBeInstanceOf(DIError)
        expect(error.message).toContain(`@${name} was applied as a legacy decorator`)
        expect(error.message).toContain('@navios/di/legacy-compat')
      }
    })

    it('refuse members and contradictory options with a DIError', () => {
      const error = caught(() =>
        (Injectable() as any)(() => {}, { kind: 'method', name: 'x', metadata: {} }),
      )
      expect(error).toBeInstanceOf(DIError)
      expect(error.message).toContain('can only be used on classes')

      expect(
        caught(() =>
          registerInjectable(class {}, {
            token: InjectionToken.create('t'),
            schema: z.object({}),
          }),
        ),
      ).toBeInstanceOf(DIError)
    })
  })

  describe('a value for a request-scoped token', () => {
    it('cannot be added to the root container', async () => {
      const REQUEST = InjectionToken.create<string>('REQUEST', { scope: InjectableScope.Request })

      @Injectable({ scope: InjectableScope.Request })
      class Handler {}

      for (const add of [
        () => container.addInstance(REQUEST, 'x'),
        () => container.addInstance(Handler, new Handler()),
      ]) {
        const error = caught(add)
        expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
        expect(error.message).toContain('belongs to a scope')
      }
      const scope = container.createScope()
      scope.addInstance(REQUEST, 'x')
      expect(await scope.get(REQUEST)).toBe('x')
    })
  })

  describe('decorate()', () => {
    it('must be called before the first resolution, as provide() must', async () => {
      @Injectable()
      class Service {}

      await container.get(Service)
      expect(() => container.decorate(Service, (s) => s)).toThrow('already resolved')
    })
  })

  describe('a second default provider', () => {
    const named = (name: string) => ({ [name]: class {} })[name]

    it('may replace a class of the same name, as hot reload does', async () => {
      const TOKEN = InjectionToken.create<object>('token')
      registerInjectable(named('Impl'), { token: TOKEN })
      const next = named('Impl')
      registerInjectable(next, { token: TOKEN })
      expect(container.getProvider(TOKEN)?.target).toBe(next)
    })

    it('is a conflict in production, where minified names collide', () => {
      vi.stubEnv('NODE_ENV', 'production')
      const TOKEN = InjectionToken.create<object>('token')
      const impl = named('a')
      registerInjectable(impl, { token: TOKEN })
      registerInjectable(impl, { token: TOKEN })
      expect(caught(() => registerInjectable(named('a'), { token: TOKEN })).code).toBe(
        DIErrorCode.ProviderConflict,
      )
    })

    it('is a conflict for classes without a name', () => {
      const TOKEN = InjectionToken.create<object>('token')
      const anonymous = () => class {}
      registerInjectable(anonymous(), { token: TOKEN })
      expect(caught(() => registerInjectable(anonymous(), { token: TOKEN })).code).toBe(
        DIErrorCode.ProviderConflict,
      )
    })
  })

  describe('a second copy of the package', () => {
    it('is told apart by its tokens and classes', async () => {
      vi.resetModules()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const other = await import('../index.mjs')
      const token = other.InjectionToken.create<string>('FOREIGN') as any

      @other.Injectable()
      class Foreign {}

      await expect(container.get(token)).rejects.toThrow(
        'Token FOREIGN belongs to another copy of @navios/di',
      )
      await expect(container.get(Foreign)).rejects.toThrow(
        'Class Foreign belongs to another copy of @navios/di',
      )
      // The same file evaluated again is a reload, and not reported.
      expect(warn).not.toHaveBeenCalled()
    })

    it('is warned about once, with every location', () => {
      const registryKey = Symbol.for('navios.di.copies')
      const holder = globalThis as any
      const saved = holder[registryKey]
      delete holder[registryKey]
      try {
        const warn = vi.fn()
        warnAboutSecondCopy('file:///app/node_modules/@navios/di/lib/a.mjs', warn)
        warnAboutSecondCopy('file:///app/node_modules/@navios/di/lib/a.mjs?t=1', warn)
        expect(warn).not.toHaveBeenCalled()
        warnAboutSecondCopy('file:///app/x/node_modules/@navios/di/lib/a.mjs', warn)
        warnAboutSecondCopy('file:///app/y/node_modules/@navios/di/lib/a.mjs', warn)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain('@navios/di is loaded more than once')
        expect(warn.mock.calls[0][0]).toContain('app/x/node_modules/@navios/di')
      } finally {
        holder[registryKey] = saved
      }
    })

    it.each([
      '../index.mjs',
      '../testing/index.mjs',
      '../legacy-compat/index.mjs',
      '../internal/index.mjs',
    ])('is noticed when only %s is loaded', async (entry) => {
      const registryKey = Symbol.for('navios.di.copies')
      const holder = globalThis as any
      const saved = holder[registryKey]
      delete holder[registryKey]
      try {
        vi.resetModules()
        await import(entry)
        expect(holder[registryKey].locations.size).toBe(1)
      } finally {
        holder[registryKey] = saved
      }
    })
  })
})
