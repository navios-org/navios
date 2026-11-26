import { createSecretKey } from 'node:crypto'

import { inject, InjectionToken, provide } from '@navios/core'
import { describe, expectTypeOf, it } from 'vitest'

import { JwtService, provideJwtService } from '../index.mjs'

import type {
  JwtComplete,
  JwtPayload,
  JwtServiceOptions,
  JwtVerifyOptions,
  SignOptions,
  VerifyOptions,
} from '../index.mjs'

declare const service: JwtService
declare const token: string
declare const unset: string | undefined

describe('JwtService.verify', () => {
  it('should return JwtPayload by default', () => {
    const payload = service.verify(token)

    expectTypeOf(payload).toEqualTypeOf<JwtPayload>()
    expectTypeOf(payload.sub).toEqualTypeOf<string | undefined>()
    expectTypeOf(payload.aud).toEqualTypeOf<string | string[] | undefined>()
    expectTypeOf(payload.roles).toEqualTypeOf<unknown>()
    expectTypeOf(service.verifyAsync(token)).toEqualTypeOf<Promise<JwtPayload>>()
  })

  it('should return the given type', () => {
    expectTypeOf(service.verify<{ sub: string }>(token)).toEqualTypeOf<{ sub: string }>()
    expectTypeOf(service.verifyAsync<{ sub: string }>(token, { audience: 'a' })).toEqualTypeOf<
      Promise<{ sub: string }>
    >()
    // @ts-expect-error a payload is an object
    service.verify<string>(token)
  })

  it('should return the parts of the token with complete: true', () => {
    expectTypeOf(service.verify(token, { complete: true })).toEqualTypeOf<JwtComplete>()
    expectTypeOf(
      service.verify<{ sub: string }>(token, { complete: true, audience: 'a' }).payload,
    ).toEqualTypeOf<{ sub: string }>()
    expectTypeOf(service.verifyAsync(token, { complete: true })).toEqualTypeOf<
      Promise<JwtComplete>
    >()
    expectTypeOf(service.verify(token, { complete: false })).toEqualTypeOf<JwtPayload>()
  })

  it('should take undefined for an option, but not for a key', () => {
    service.verify(token, { audience: unset, issuer: unset, maxAge: unset })
    service.verify(token, { secret: new Uint8Array(32) })
    // @ts-expect-error null does not switch a check off
    service.verify(token, { audience: null })
    // @ts-expect-error "none" is not an algorithm
    service.verify(token, { algorithms: ['none'] })
  })

  it('should accept options passed through a variable', () => {
    const options: JwtVerifyOptions = { algorithms: ['HS256'] }

    expectTypeOf(service.verify(token, options)).toEqualTypeOf<JwtPayload>()
  })
})

describe('JwtService.decode', () => {
  it('should include null in the return type', () => {
    expectTypeOf(service.decode(token)).toEqualTypeOf<JwtPayload | null>()
    expectTypeOf(service.decode<{ sub: string }>(token)).toEqualTypeOf<{ sub: string } | null>()
    expectTypeOf(service.decode(token, { complete: true })).toEqualTypeOf<JwtComplete | null>()
    expectTypeOf(service.decode<string>(token, { json: false })).toEqualTypeOf<string | null>()
  })
})

describe('JwtService.sign', () => {
  it('should take null and undefined for claims', () => {
    service.sign({}, { expiresIn: null, audience: null, issuer: unset, subject: unset })
    void service.signAsync({}, { notBefore: null, jwtid: null })
  })

  it('should take part of a header', () => {
    service.sign({}, { header: { kid: 'a' } })
    // @ts-expect-error not a header parameter
    service.sign({}, { header: { nope: 1 } })
  })

  it('should reject what fails at run time', () => {
    // @ts-expect-error a RegExp is only for verifying
    service.sign({}, { audience: /x/ })
    // @ts-expect-error "none" is not an algorithm
    service.sign({}, { algorithm: 'none' })
    // @ts-expect-error a claim option with a string payload
    service.sign('text', { expiresIn: '1h' })
    // @ts-expect-error a claim option with a string payload
    void service.signAsync('text', { expiresIn: '1h' })
  })

  it('should take the other options with a string payload', () => {
    service.sign('text', { algorithm: 'HS512', keyid: 'a', secret: 'b' })
    void service.signAsync('text', { algorithm: 'HS512', keyid: 'a', secret: 'b' })
  })
})

describe('JwtServiceOptions', () => {
  it('should take an environment variable', () => {
    expectTypeOf({ secret: process.env.JWT_SECRET }).toExtend<JwtServiceOptions>()
    expectTypeOf({
      publicKey: unset,
      verifyOptions: { audience: unset },
      signOptions: { expiresIn: unset, issuer: unset },
    }).toExtend<JwtServiceOptions>()
  })

  it('should take a keys function that may know no key', () => {
    const known = new Map([['a', createSecretKey(Buffer.alloc(32, 1))]])
    const options: JwtServiceOptions = {
      keys: (request) =>
        request.use === 'verify'
          ? known.get(request.header.kid ?? '')
          : { key: known.get('a')!, keyid: 'a', algorithms: ['HS256'] },
    }
    const asynchronous: JwtServiceOptions = {
      keys: async (request) => (request.use === 'verify' ? known.get('a') : new Uint8Array(32)),
    }

    const table: Partial<Record<string, string>> = {}
    const fromTable: JwtServiceOptions = {
      keys: (request) => ({
        key: request.use === 'verify' ? table[request.header.kid ?? ''] : 'secret',
        algorithms: ['HS256'],
      }),
    }

    expectTypeOf(options.keys).not.toBeAny()
    expectTypeOf(fromTable.keys).not.toBeAny()
    expectTypeOf(asynchronous.keys).not.toBeAny()
  })
})

describe('provideJwtService', () => {
  it('should return a token of its own', () => {
    const Jwt = provideJwtService({ secret: unset }, { name: 'Jwt' })
    const Secret = InjectionToken.create<string>('Secret')
    const Async = provideJwtService(async (ctx) => ({ secret: await ctx.inject(Secret) }))

    expectTypeOf(Jwt).toEqualTypeOf<InjectionToken<JwtService, undefined>>()
    expectTypeOf(Async).toEqualTypeOf<InjectionToken<JwtService, undefined>>()
    expectTypeOf(() => inject(Jwt)).returns.toEqualTypeOf<JwtService>()
    provide(Jwt, { value: service })
    provide(Async, { class: JwtService })
    // @ts-expect-error not a JwtService
    provide(Async, class Fake {})
  })
})

describe('JwtServiceOptions', () => {
  it('should type the default options with exported types', () => {
    expectTypeOf<JwtServiceOptions['signOptions']>().toEqualTypeOf<SignOptions | undefined>()
    expectTypeOf<JwtServiceOptions['verifyOptions']>().toEqualTypeOf<VerifyOptions | undefined>()
  })
})
