import {
  Container,
  inject,
  InjectableScope,
  InjectionToken,
  provide,
  registerInjectable,
} from '@navios/di'
import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FactoryContext } from '@navios/di'

import { JsonWebTokenError, JwtService, provideJwtService } from '../index.mjs'

const ACCESS = 'access'.padEnd(32, '-')
const REFRESH = 'refresh'.padEnd(32, '-')

describe('provideJwtService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should return a token with the given name', () => {
    expect(provideJwtService({ secret: ACCESS }).toString()).toBe('JwtService')
    expect(provideJwtService({ secret: ACCESS }, { name: 'RefreshJwt' }).toString()).toBe(
      'RefreshJwt',
    )
  })

  it('should name the service in a configuration error', async () => {
    const RefreshJwt = provideJwtService({ secret: '' }, { name: 'RefreshJwt' })

    await expect(container.get(RefreshJwt)).rejects.toThrow(/RefreshJwt.*`secret`/)
  })

  it('should give every call a service of its own', async () => {
    const Access = provideJwtService({ secret: ACCESS })
    const Refresh = provideJwtService({ secret: REFRESH })
    const SameAsAccess = provideJwtService({ secret: ACCESS })

    const access = await container.get(Access)
    const refresh = await container.get(Refresh)

    expect(access).toBeInstanceOf(JwtService)
    expect(await container.get(Access)).toBe(access)
    expect(await container.get(SameAsAccess)).not.toBe(access)
    expect(() => refresh.verify(access.sign({ sub: 'u' }))).toThrow(JsonWebTokenError)
  })

  it('should give every container a service of its own', async () => {
    const Jwt = provideJwtService({ secret: ACCESS })
    const other = new Container()
    try {
      expect(await other.get(Jwt)).not.toBe(await container.get(Jwt))
    } finally {
      await other.dispose()
    }
  })

  it('should share the service with the scopes of a container', async () => {
    const Jwt = provideJwtService(async () => ({ secret: ACCESS }))
    const scope = container.createScope()
    try {
      expect(await scope.get(Jwt)).toBe(await container.get(Jwt))
    } finally {
      await scope.dispose()
    }
  })

  it('should not build anything before the service is resolved', async () => {
    const config = vi.fn(() => ({ secret: ACCESS }))
    const Jwt = provideJwtService(config)
    provideJwtService({ secret: '' })

    expect(config).not.toHaveBeenCalled()
    await container.get(Jwt)
    await container.get(Jwt)
    expect(config).toHaveBeenCalledTimes(1)

    const other = new Container()
    await other.get(Jwt)
    await other.dispose()
    expect(config).toHaveBeenCalledTimes(2)
  })

  it('should resolve synchronously unless the configuration is asynchronous', async () => {
    expect(container.getSync(provideJwtService({ secret: ACCESS }))).toBeInstanceOf(JwtService)
    expect(container.getSync(provideJwtService(() => ({ secret: ACCESS })))).toBeInstanceOf(
      JwtService,
    )
    const Async = provideJwtService(async () => ({ secret: ACCESS }))
    expect(() => container.getSync(Async)).toThrow()
    expect(await container.get(Async)).toBeInstanceOf(JwtService)
  })

  it('should wait for a configuration that is a thenable', async () => {
    const thenable = {
      then(resolve: (options: { secret: string }) => void) {
        resolve({ secret: ACCESS })
      },
    }
    const Jwt = provideJwtService(() => thenable as unknown as Promise<{ secret: string }>)

    expect(await container.get(Jwt)).toBeInstanceOf(JwtService)
  })

  it('should inject the service of an asynchronous configuration', async () => {
    const Jwt = provideJwtService(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { secret: ACCESS }
    })
    class Guard {
      readonly jwt = inject(Jwt)
      readonly subject = this.jwt.verify?.(this.jwt.sign({ sub: 'u' })).sub
    }
    registerInjectable(Guard)

    expect((await container.get(Guard)).subject).toBe('u')
  })

  it('should give the configuration function a factory context', async () => {
    const SECRET = InjectionToken.create<string>('Secret')
    container.addInstance(SECRET, ACCESS)
    const Jwt = provideJwtService(async (ctx: FactoryContext) => ({
      secret: await ctx.inject(SECRET),
    }))

    const token = (await container.get(Jwt)).sign({ sub: 'u' })

    expect(new JwtService({ secret: ACCESS }).verify(token).sub).toBe('u')
  })

  it('should try again after the configuration function failed', async () => {
    let attempts = 0
    const Jwt = provideJwtService(async () => {
      if (++attempts === 1) {
        throw new Error('secret store unavailable')
      }
      return { secret: ACCESS }
    })

    await expect(container.get(Jwt)).rejects.toThrow('secret store unavailable')
    expect(await container.get(Jwt)).toBeInstanceOf(JwtService)
  })

  it('should refuse a request-scoped dependency of the configuration', async () => {
    class Tenant {}
    registerInjectable(Tenant, { scope: InjectableScope.Request })
    const Jwt = provideJwtService(async (ctx) => {
      await ctx.inject(Tenant)
      return { secret: ACCESS }
    })
    const scope = container.createScope()
    try {
      await expect(scope.get(Jwt)).rejects.toThrow(/request-scoped/)
    } finally {
      await scope.dispose()
    }
  })

  describe('replacing one service', () => {
    const Access = provideJwtService({ secret: ACCESS }, { name: 'AccessJwt' })
    const Refresh = provideJwtService(async () => ({ secret: REFRESH }), { name: 'RefreshJwt' })

    class FakeSigner {
      sign() {
        return 'fake'
      }
    }
    const FakeJwt = FakeSigner as unknown as new () => JwtService

    it('should work with provide() and leave the others alone', async () => {
      for (const target of [Access, Refresh]) {
        for (const impl of [
          FakeJwt,
          { class: FakeJwt },
          { value: new FakeJwt() },
          { factory: () => new FakeJwt() },
        ]) {
          const replaced = new Container({ providers: [provide(target, impl)] })
          try {
            for (const token of [Access, Refresh]) {
              const signed = (await replaced.get(token)).sign({ sub: 'u' })
              expect(signed === 'fake').toBe(token === target)
            }
          } finally {
            await replaced.dispose()
          }
        }
      }
    })

    it('should work with TestContainer.bind()', async () => {
      const replaced = new TestContainer()
      replaced.bind(Access).toValue(new JwtService({ secret: REFRESH }))
      try {
        const token = (await replaced.get(Access)).sign({ sub: 'u' })
        expect((await replaced.get(Refresh)).verify(token).sub).toBe('u')
      } finally {
        await replaced.dispose()
      }
    })

    it('should accept a subclass', async () => {
      class Recording extends JwtService {
        readonly signed: unknown[] = []
        constructor() {
          super({ secret: ACCESS })
        }
        override sign(payload: string | object) {
          this.signed.push(payload)
          return super.sign(payload as object)
        }
      }
      const replaced = new Container({ providers: [provide(Access, Recording)] })
      try {
        const service = (await replaced.get(Access)) as Recording
        service.sign({ a: 1 })
        expect(service.signed).toEqual([{ a: 1 }])
      } finally {
        await replaced.dispose()
      }
    })
  })
})
