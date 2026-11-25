import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { JsonWebTokenError, JwtService, TokenExpiredError } from '../index.mjs'

import type { JwtSignOptions, JwtVerifyOptions } from '../index.mjs'

const SECRET = 's'.repeat(32)
const OTHER_SECRET = 'o'.repeat(32)

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

function configurationError(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    expect(error).not.toBeInstanceOf(JsonWebTokenError)
    return error as Error
  }
  throw new Error('expected the call to throw')
}

describe('options of a single call', () => {
  const strict = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: '15m', issuer: 'me', audience: 'api' },
    verifyOptions: {
      algorithms: ['HS256'],
      audience: 'api',
      issuer: 'me',
      subject: 'u',
      jwtid: 'id',
      maxAge: '1h',
    },
  })
  const plain = new JwtService({ secret: SECRET })
  const claims = { sub: 'u', aud: 'api', iss: 'me', jti: 'id' }

  describe('verify', () => {
    const wrong: Record<string, string> = {
      audience: plain.sign({ ...claims, aud: 'other' }),
      issuer: plain.sign({ ...claims, iss: 'evil' }),
      subject: plain.sign({ ...claims, sub: 'x' }),
      jwtid: plain.sign({ ...claims, jti: 'x' }),
      maxAge: plain.sign({ ...claims, iat: Math.floor(Date.now() / 1000) - 7200 }),
      algorithms: plain.sign(claims, { algorithm: 'HS512' }),
    }

    for (const [option, token] of Object.entries(wrong)) {
      it(`should keep the configured ${option} check when the option is undefined`, async () => {
        const options: JwtVerifyOptions = { [option]: undefined }

        expect(() => strict.verify(token)).toThrow(JsonWebTokenError)
        expect(() => strict.verify(token, options)).toThrow(JsonWebTokenError)
        await expect(strict.verifyAsync(token, options)).rejects.toBeInstanceOf(JsonWebTokenError)
      })

      it(`should not take null as a way to switch the ${option} check off`, () => {
        const options = { [option]: null } as unknown as JwtVerifyOptions

        expect(configurationError(() => strict.verify(token, options)).message).toContain(option)
      })
    }

    it('should let an option that is set replace the configured one', () => {
      const token = plain.sign({ ...claims, aud: 'other' })

      expect(strict.verify(token, { audience: 'other' }).sub).toBe('u')
    })

    it('should refuse values that would not check anything', () => {
      const token = plain.sign({ ...claims, exp: 5 })
      const useless: Record<string, unknown>[] = [
        { audience: '' },
        { audience: [] },
        { audience: [''] },
        { issuer: '' },
        { issuer: [] },
        { subject: '' },
        { jwtid: '' },
        { nonce: '' },
        { maxAge: 0 },
        { maxAge: '' },
        { maxAge: '1800' },
        { maxAge: 'soon' },
        { algorithms: [] },
        { algorithms: 'HS256' },
        { algorithms: ['EdDSA'] },
        { clockTolerance: '30' },
        { clockTolerance: Number.NaN },
        { clockTolerance: Infinity },
        { clockTimestamp: '1' },
        { ignoreExpiration: 'false' },
      ]
      for (const options of useless) {
        const [name] = Object.keys(options) as [string]
        expect(configurationError(() => plain.verify(token, options)).message).toContain(name)
        expect(
          configurationError(() => new JwtService({ secret: SECRET, verifyOptions: options }))
            .message,
        ).toContain(name)
      }
    })

    it('should accept a Uint8Array secret and key', () => {
      const bytes = new Uint8Array(Buffer.from(SECRET))
      const signer = new JwtService({ privateKey: new Uint8Array(Buffer.from(privateKey)) })

      expect(plain.verify(plain.sign({ sub: 'u' }), { secret: bytes }).sub).toBe('u')
      expect(
        new JwtService({}).verify(signer.sign({ sub: 'u' }), {
          publicKey: new Uint8Array(Buffer.from(publicKey)),
        }).sub,
      ).toBe('u')
    })
  })

  describe('sign', () => {
    it('should keep the configured defaults when an option is undefined', () => {
      const payload = strict.decode(
        strict.sign(
          { sub: 'u' },
          { expiresIn: undefined, issuer: undefined, algorithm: undefined },
        ),
      )!

      expect(payload.exp! - payload.iat!).toBe(900)
      expect(payload.iss).toBe('me')
    })

    it('should leave a default claim out when the option is null', async () => {
      const options: JwtSignOptions = { expiresIn: null, issuer: null, audience: null }
      const payload = strict.decode(strict.sign({ sub: 'u' }, options))!

      expect(payload).not.toHaveProperty('exp')
      expect(payload).not.toHaveProperty('iss')
      expect(payload).not.toHaveProperty('aud')
      expect(strict.decode(await strict.signAsync({ sub: 'u' }, options))).not.toHaveProperty('exp')
    })

    it('should not apply a default to a claim the payload has', () => {
      const exp = Math.floor(Date.now() / 1000) + 60
      const payload = strict.decode(strict.sign({ sub: 'u', exp, iss: 'other', aud: ['a'] }))!

      expect(payload).toMatchObject({ exp, iss: 'other', aud: ['a'] })
    })

    it('should sign a verified payload again', () => {
      const token = strict.sign({ sub: 'u', jti: 'id' })
      const payload = strict.verify(token)

      expect(strict.verify(strict.sign(payload))).toEqual(payload)
    })

    it('should still refuse an option of the call that contradicts the payload', () => {
      expect(() => strict.sign({ sub: 'u', exp: 9999999999 }, { expiresIn: '1h' })).toThrow(/exp/)
      expect(() => strict.sign({ sub: 'u', iss: 'a' }, { issuer: 'b' })).toThrow(/iss/)
    })

    it('should refuse a time span without a unit', () => {
      for (const options of [
        { expiresIn: '900' },
        { notBefore: '900' },
        { expiresIn: ' 900 ' },
        { expiresIn: '-1' },
        { expiresIn: '1.5' },
        { expiresIn: '' },
        { expiresIn: 'soon' },
      ]) {
        const [name] = Object.keys(options) as [string]
        expect(configurationError(() => plain.sign({ a: 1 }, options)).message).toContain(name)
        expect(
          configurationError(() => new JwtService({ secret: SECRET, signOptions: options }))
            .message,
        ).toContain(name)
      }
    })

    it('should accept numbers and time spans with a unit', () => {
      const lifetime = (expiresIn: string | number) => {
        const { exp, iat } = plain.decode(plain.sign({ a: 1 }, { expiresIn }))!
        return exp! - iat!
      }

      expect(lifetime(900)).toBe(900)
      expect(lifetime('900s')).toBe(900)
      expect(lifetime('15m')).toBe(900)
      expect(lifetime('15 minutes')).toBe(900)
      expect(lifetime('0.5h')).toBe(1800)
      expect(lifetime('-1s')).toBe(-1)
    })

    it('should accept a header without alg', () => {
      const token = plain.sign({ a: 1 }, { header: { kid: 'k1' } })

      expect(plain.decode(token, { complete: true })?.header).toMatchObject({
        alg: 'HS256',
        kid: 'k1',
      })
    })

    it('should allow options that are not claims with a string payload', () => {
      const token = plain.sign('hello', { algorithm: 'HS512', keyid: 'k1' })

      expect(plain.decode(token, { complete: true })).toMatchObject({
        header: { alg: 'HS512', kid: 'k1' },
        payload: 'hello',
      })
    })
  })

  describe('keys', () => {
    const platform = strict.sign({ sub: 'u', jti: 'id' })
    const empty: Record<string, unknown> = {
      'an empty string': '',
      'an empty Buffer': Buffer.alloc(0),
      'an empty Uint8Array': new Uint8Array(),
      undefined: undefined,
      null: null,
    }

    for (const [name, key] of Object.entries(empty)) {
      it(`should not fall back to the key of the service when the key of the call is ${name}`, async () => {
        for (const options of [{ secret: key }, { publicKey: key }] as JwtVerifyOptions[]) {
          const [slot] = Object.keys(options) as [string]
          expect(configurationError(() => strict.verify(platform, options)).message).toContain(slot)
          await expect(strict.verifyAsync(platform, options)).rejects.not.toBeInstanceOf(
            JsonWebTokenError,
          )
        }
        for (const options of [{ secret: key }, { privateKey: key }] as JwtSignOptions[]) {
          const [slot] = Object.keys(options) as [string]
          expect(configurationError(() => strict.sign({ a: 1 }, options)).message).toContain(slot)
          await expect(strict.signAsync({ a: 1 }, options)).rejects.toThrow(slot)
        }
      })
    }

    it('should verify with the key of the call only', () => {
      const tenant = plain.sign({ sub: 't' }, { secret: OTHER_SECRET })

      expect(plain.verify(tenant, { secret: OTHER_SECRET }).sub).toBe('t')
      expect(() => plain.verify(tenant)).toThrow(JsonWebTokenError)
      expect(() => plain.verify(plain.sign({ a: 1 }), { secret: OTHER_SECRET })).toThrow(
        JsonWebTokenError,
      )
    })

    it('should report algorithms that cannot be used with the key as a configuration error', () => {
      const token = plain.sign({ a: 1 })

      expect(
        configurationError(() => plain.verify(token, { algorithms: ['RS256'] })).message,
      ).toMatch(/`secret`.*RS256/)
      expect(
        configurationError(() => plain.verify(token, { publicKey, algorithms: ['HS256'] })).message,
      ).toMatch(/`publicKey`.*HS256/)
      expect(
        configurationError(() => plain.sign({ a: 1 }, { algorithm: 'RS256' })).message,
      ).toMatch(/`secret`.*RS256/)
    })
  })

  describe('complete', () => {
    it('should return header, payload and signature', async () => {
      const token = plain.sign({ sub: 'u' })
      const expected = {
        header: { alg: 'HS256', typ: 'JWT' },
        payload: { sub: 'u' },
        signature: token.split('.')[2],
      }

      expect(plain.verify(token, { complete: true })).toMatchObject(expected)
      expect(await plain.verifyAsync(token, { complete: true })).toMatchObject(expected)
      expect(plain.decode(token, { complete: true })).toMatchObject(expected)
    })

    it('should not be a default of the service', () => {
      const verifyOptions = { complete: true } as object
      const service = new JwtService({ secret: SECRET, verifyOptions })

      expect(service.verify(service.sign({ sub: 'u' })).sub).toBe('u')
    })
  })

  it('should reject a payload that is not an object', async () => {
    for (const token of [
      plain.sign('hello'),
      plain.sign('[1,2]'),
      plain.sign('null'),
      plain.sign('5'),
      plain.sign(Buffer.from('hello')),
    ]) {
      expect(() => plain.verify(token)).toThrow(JsonWebTokenError)
      await expect(plain.verifyAsync(token)).rejects.toBeInstanceOf(JsonWebTokenError)
    }
  })

  it('should not change the options of a call or of the configuration', () => {
    const signOptions = Object.freeze({ expiresIn: '1h', header: Object.freeze({ kid: 'a' }) })
    const verifyOptions = Object.freeze({ algorithms: Object.freeze(['HS256'] as const) })
    const service = new JwtService(Object.freeze({ secret: SECRET, signOptions, verifyOptions }))
    const call = Object.freeze({ secret: OTHER_SECRET, expiresIn: -10 })

    const token = service.sign({ a: 1 }, call)

    expect(() => service.verify(token, Object.freeze({ secret: OTHER_SECRET }))).toThrow(
      TokenExpiredError,
    )
  })
})
