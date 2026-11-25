import { createHmac, createPublicKey, createSecretKey, generateKeyPairSync } from 'node:crypto'

import { Container, DIErrorCode } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JsonWebTokenError,
  NotBeforeError,
  provideJwtService,
  TokenExpiredError,
} from '../index.mjs'

import type { JwtKeyMaterial, JwtKeyRequest, JwtServiceOptions } from '../index.mjs'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('JwtService keys and security', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await container.dispose()
  })

  async function createJwtService(options: JwtServiceOptions) {
    return container.get(provideJwtService(options))
  }

  describe('asymmetric keys', () => {
    it('should sign and verify an RS256 token with a generated key pair', async () => {
      const service = await createJwtService({
        privateKey,
        publicKey,
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
      })

      const token = service.sign({ sub: 'user' })

      expect(service.decode(token, { complete: true })?.header.alg).toBe('RS256')
      expect(service.verify<{ sub: string }>(token).sub).toBe('user')
      expect((await service.verifyAsync<{ sub: string }>(token)).sub).toBe('user')
    })

    it('should reject an RS256 token signed with another private key', async () => {
      const other = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      const service = await createJwtService({ privateKey, publicKey })
      const forger = await createJwtService({ privateKey: other.privateKey })

      const token = forger.sign({ sub: 'admin' }, { algorithm: 'RS256' })

      expect(() => service.verify(token)).toThrow(JsonWebTokenError)
    })
  })

  describe('algorithm confusion', () => {
    function forgeHs256WithPublicKey() {
      const unsigned = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: 'admin' })}`
      return `${unsigned}.${createHmac('sha256', publicKey).update(unsigned).digest('base64url')}`
    }

    it('should reject an HS256 token signed with the RSA public key', async () => {
      const service = await createJwtService({ privateKey, publicKey })
      const forged = forgeHs256WithPublicKey()

      expect(() => service.verify(forged)).toThrow(JsonWebTokenError)
      await expect(service.verifyAsync(forged)).rejects.toBeInstanceOf(JsonWebTokenError)
    })

    it('should reject it when the public key is given per call', async () => {
      const service = await createJwtService({})

      expect(() => service.verify(forgeHs256WithPublicKey(), { publicKey })).toThrow(
        JsonWebTokenError,
      )
    })
  })

  describe('alg none', () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: 'admin' })}.`

    it('should reject an unsigned token when a key is configured', async () => {
      const hmac = await createJwtService({ secret: 'test-secret' })
      const rsa = await createJwtService({ privateKey, publicKey })

      expect(() => hmac.verify(unsigned)).toThrow(JsonWebTokenError)
      expect(() => rsa.verify(unsigned)).toThrow(JsonWebTokenError)
      await expect(hmac.verifyAsync(unsigned)).rejects.toBeInstanceOf(JsonWebTokenError)
    })
  })

  describe('claim errors', () => {
    it('should tell expired, not-yet-valid and invalid tokens apart by class', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const now = Math.floor(Date.now() / 1000)
      const expired = service.sign({ sub: 'u', exp: now - 60 })
      const early = service.sign({ sub: 'u', nbf: now + 60 })
      const tampered = `${service.sign({ sub: 'u' }).slice(0, -2)}xx`

      const errorOf = (token: string) => {
        try {
          service.verify(token)
        } catch (error) {
          return error
        }
        throw new Error('expected verify to throw')
      }

      const expiredError = errorOf(expired)
      expect(expiredError).toBeInstanceOf(TokenExpiredError)
      expect(expiredError).not.toBeInstanceOf(NotBeforeError)

      const earlyError = errorOf(early)
      expect(earlyError).toBeInstanceOf(NotBeforeError)
      expect(earlyError).not.toBeInstanceOf(TokenExpiredError)

      const tamperedError = errorOf(tampered)
      expect(tamperedError).toBeInstanceOf(JsonWebTokenError)
      expect(tamperedError).not.toBeInstanceOf(TokenExpiredError)
      expect(tamperedError).not.toBeInstanceOf(NotBeforeError)
    })

    it('should accept a just-expired token only within clockTolerance', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const now = Math.floor(Date.now() / 1000)
      const token = service.sign({ sub: 'u', exp: now - 5 })

      expect(() => service.verify(token)).toThrow(TokenExpiredError)
      expect(() => service.verify(token, { clockTolerance: 2 })).toThrow(TokenExpiredError)
      expect(service.verify<{ sub: string }>(token, { clockTolerance: 30 }).sub).toBe('u')
    })

    it('should apply clockTolerance to the not-before claim', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const now = Math.floor(Date.now() / 1000)
      const token = service.sign({ sub: 'u', nbf: now + 5 })

      expect(() => service.verify(token)).toThrow(NotBeforeError)
      expect(service.verify<{ sub: string }>(token, { clockTolerance: 30 }).sub).toBe('u')
    })
  })

  describe('keys', () => {
    const secretKey = (text: string) => createSecretKey(Buffer.from(text.padEnd(32, '-')))
    const headerOf = async (token: string) =>
      (await createJwtService({})).decode(token, { complete: true })!.header

    it('should use a synchronous function for sync and async calls', async () => {
      const keys = vi.fn((_request: JwtKeyRequest) => secretKey('keys'))
      const service = await createJwtService({ keys })
      const reference = await createJwtService({ secret: secretKey('keys') })

      const token = service.sign({ a: 1 })
      const asyncToken = await service.signAsync({ a: 2 })

      expect(reference.verify<{ a: number }>(token).a).toBe(1)
      expect(reference.verify<{ a: number }>(asyncToken).a).toBe(2)
      expect(service.verify<{ a: number }>(token).a).toBe(1)
      expect((await service.verifyAsync<{ a: number }>(token)).a).toBe(1)
      expect(keys).toHaveBeenCalledWith({ use: 'sign', payload: { a: 1 } })
      expect(keys).toHaveBeenCalledWith({ use: 'verify', header: { alg: 'HS256', typ: 'JWT' } })
    })

    it('should await an asynchronous function in signAsync and verifyAsync', async () => {
      const service = await createJwtService({
        keys: async ({ use }) => {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return use === 'sign' ? privateKey : publicKey
        },
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
      })

      const token = await service.signAsync({ sub: 'user' })

      expect((await service.verifyAsync(token)).sub).toBe('user')
    })

    it('should rotate keys by the kid header', async () => {
      const known = new Map([
        ['2025', secretKey('old')],
        ['2026', secretKey('new')],
      ])
      const service = await createJwtService({
        keys: (request) =>
          request.use === 'sign'
            ? { key: known.get('2026')!, keyid: '2026' }
            : known.get(request.header.kid ?? ''),
      })
      const old = await createJwtService({ secret: secretKey('old') })

      const token = service.sign({ sub: 'u' })

      expect((await headerOf(token)).kid).toBe('2026')
      expect(service.verify(token).sub).toBe('u')
      expect(service.verify(old.sign({ sub: 'o' }, { keyid: '2025' })).sub).toBe('o')
      // The right kid with the wrong key, an unknown kid and no kid at all.
      for (const options of [{ keyid: '2026' }, { keyid: '2024' }, { keyid: '__proto__' }, {}]) {
        expect(() => service.verify(old.sign({ sub: 'o' }, options))).toThrow(JsonWebTokenError)
      }
    })

    it('should let the keyid of the call win over the one of the key', async () => {
      const service = await createJwtService({
        keys: () => ({ key: secretKey('k'), keyid: 'from-key' }),
        signOptions: { keyid: 'from-config' },
      })

      expect((await headerOf(service.sign({}))).kid).toBe('from-key')
      expect((await headerOf(service.sign({}, { keyid: 'from-call' }))).kid).toBe('from-call')
    })

    it('should choose the key by a claim of the payload', async () => {
      const service = await createJwtService({
        keys: (request) =>
          request.use === 'sign'
            ? {
                key: secretKey((request.payload as { tenant: string }).tenant),
                keyid: (request.payload as { tenant: string }).tenant,
              }
            : secretKey(request.header.kid!),
      })

      expect(service.verify(service.sign({ tenant: 'a' })).tenant).toBe('a')
      expect((await headerOf(service.sign({ tenant: 'b' }))).kid).toBe('b')
    })

    it('should verify and sign with the algorithms of the key', async () => {
      const key = secretKey('k')
      const service = await createJwtService({ keys: () => ({ key, algorithms: ['HS512'] }) })
      const other = await createJwtService({ secret: key })

      expect((await headerOf(service.sign({}))).alg).toBe('HS512')
      expect(service.verify(other.sign({ sub: 'u' }, { algorithm: 'HS512' })).sub).toBe('u')
      expect(() => service.verify(other.sign({ sub: 'u' }))).toThrow(JsonWebTokenError)
      expect(() => service.sign({}, { algorithm: 'HS256' })).toThrow(/cannot be used to sign/)
    })

    it('should not let the algorithms of the key widen the configured ones', async () => {
      const key = secretKey('k')
      const service = await createJwtService({
        keys: () => ({ key, algorithms: ['HS256', 'HS512'] }),
        verifyOptions: { algorithms: ['HS256'] },
      })
      const other = await createJwtService({ secret: key })

      expect(service.verify(other.sign({ sub: 'u' })).sub).toBe('u')
      expect(() => service.verify(other.sign({}, { algorithm: 'HS512' }))).toThrow(
        JsonWebTokenError,
      )
    })

    it('should reject a token whose kid names a key for other algorithms', async () => {
      const service = await createJwtService({
        keys: () => createPublicKey(publicKey),
        verifyOptions: { algorithms: ['HS256'] },
      })
      const other = await createJwtService({ secret: secretKey('k') })

      expect(() => service.verify(other.sign({}))).toThrow(JsonWebTokenError)
    })

    it('should accept text and bytes when the algorithms say what they are', async () => {
      const text = 'k'.repeat(32)
      const materials: JwtKeyMaterial[] = [
        { key: text, algorithms: ['HS256'] },
        { key: Buffer.from(text), algorithms: ['HS256'] },
        { key: new Uint8Array(Buffer.from(text)), algorithms: ['HS256'] },
      ]
      for (const material of materials) {
        const service = await createJwtService({ keys: () => material })
        expect(service.verify(service.sign({ sub: 'u' })).sub).toBe('u')
      }
      const pinned = await createJwtService({
        keys: () => text,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      })
      expect(pinned.verify(pinned.sign({ sub: 'u' })).sub).toBe('u')
    })

    it('should reject a token with an unknown key, and fail to sign without one', async () => {
      for (const nothing of [undefined, null as unknown as undefined]) {
        const service = await createJwtService({ keys: () => nothing })
        const token = (await createJwtService({ secret: secretKey('k') })).sign({ a: 1 })

        expect(() => service.verify(token)).toThrow(JsonWebTokenError)
        await expect(service.verifyAsync(token)).rejects.toBeInstanceOf(JsonWebTokenError)
        expect(() => service.sign({ a: 1 })).toThrow(/`keys` returned no key/)
        expect(() => service.sign({ a: 1 })).not.toThrow(JsonWebTokenError)
      }
    })

    it('should reject a token signed with another key when the function is asynchronous', async () => {
      const service = await createJwtService({ keys: async () => secretKey('right') })
      const other = await createJwtService({ secret: secretKey('wrong') })

      await expect(service.verifyAsync(other.sign({ a: 1 }))).rejects.toBeInstanceOf(
        JsonWebTokenError,
      )
    })

    it('should pass on the error of the function', async () => {
      class Unavailable extends Error {}
      const asynchronous = await createJwtService({
        keys: async () => {
          throw new Unavailable('jwks unavailable')
        },
      })
      const synchronous = await createJwtService({
        keys: () => {
          throw new Unavailable('jwks unavailable')
        },
      })
      const token = (await createJwtService({ secret: secretKey('k') })).sign({ a: 1 })

      await expect(asynchronous.verifyAsync(token)).rejects.toBeInstanceOf(Unavailable)
      await expect(asynchronous.signAsync({ a: 1 })).rejects.toBeInstanceOf(Unavailable)
      expect(() => synchronous.verify(token)).toThrow(Unavailable)
      expect(() => synchronous.sign({ a: 1 })).toThrow(Unavailable)
    })

    it('should throw a clear error from sync sign and verify when the function is asynchronous', async () => {
      const service = await createJwtService({ keys: async () => secretKey('k') })
      const failing = await createJwtService({ keys: () => Promise.reject(new Error('late')) })
      const token = (await createJwtService({ secret: secretKey('k') })).sign({ a: 1 })

      for (const jwt of [service, failing]) {
        expect(() => jwt.sign({ a: 1 })).toThrow(/signAsync/)
        expect(() => jwt.verify(token)).toThrow(/verifyAsync/)
      }
    })
  })

  describe('key precedence', () => {
    it('should prefer a per-call publicKey over the instance secret', async () => {
      const signer = await createJwtService({ privateKey, signOptions: { algorithm: 'RS256' } })
      const service = await createJwtService({ secret: 'hs-secret' })
      const token = signer.sign({ sub: 'u' })

      const decoded = service.verify<{ sub: string }>(token, {
        publicKey,
        algorithms: ['RS256'],
      })

      expect(decoded.sub).toBe('u')
    })

    it('should prefer a per-call privateKey over the instance secret', async () => {
      const service = await createJwtService({ secret: 'hs-secret' })

      const token = service.sign({ sub: 'u' }, { privateKey, algorithm: 'RS256' })

      expect(service.verify<{ sub: string }>(token, { publicKey }).sub).toBe('u')
      expect(() => service.verify(token)).toThrow(JsonWebTokenError)
    })

    it('should prefer a per-call secret over the keys function', async () => {
      const keys = vi.fn(() => createSecretKey(Buffer.from('keys-secret')))
      const service = await createJwtService({ keys })
      const other = await createJwtService({ secret: 'other' })
      const keysToken = service.sign({ a: 1 })
      const otherToken = other.sign({ a: 2 })
      keys.mockClear()

      expect(service.verify<{ a: number }>(otherToken, { secret: 'other' }).a).toBe(2)
      expect(() => service.verify(keysToken, { secret: 'other' })).toThrow(JsonWebTokenError)
      expect(keys).not.toHaveBeenCalled()
    })

    it('should prefer the keys function over the instance secret', async () => {
      const service = await createJwtService({
        secret: 'instance-secret',
        keys: () => createSecretKey(Buffer.from('keys-secret')),
      })
      const instance = await createJwtService({ secret: 'instance-secret' })

      expect(() => service.verify(instance.sign({ a: 1 }))).toThrow(JsonWebTokenError)
    })

    it('should prefer the secret over the key within one level', async () => {
      const service = await createJwtService({ secret: 'hs-secret', privateKey, publicKey })

      const token = service.sign({ a: 1 })

      expect(service.decode(token, { complete: true })?.header.alg).toBe('HS256')
      expect(service.verify<{ a: number }>(token).a).toBe(1)
    })
  })

  describe('key types in the configuration', () => {
    it('should accept a Buffer secret', async () => {
      const service = await createJwtService({ secret: Buffer.from('buffer-secret') })
      const reference = await createJwtService({ secret: 'buffer-secret' })

      expect(reference.verify<{ a: number }>(service.sign({ a: 1 })).a).toBe(1)
    })

    it('should accept KeyObject keys and secrets', async () => {
      const signer = await createJwtService({ privateKey, signOptions: { algorithm: 'RS256' } })
      const service = await createJwtService({ publicKey: createPublicKey(publicKey) })
      const hmac = await createJwtService({ secret: createSecretKey(Buffer.from('k'.repeat(32))) })

      expect(service.verify<{ a: number }>(signer.sign({ a: 1 })).a).toBe(1)
      expect(hmac.verify<{ a: number }>(hmac.sign({ a: 2 })).a).toBe(2)
    })

    it('should keep services with different Buffer secrets apart', async () => {
      const first = await createJwtService({ secret: Buffer.from('first-secret') })
      const second = await createJwtService({ secret: Buffer.from('second-secret') })

      expect(() => second.verify(first.sign({ a: 1 }))).toThrow(JsonWebTokenError)
    })

    it('should still reject a secret of another type', async () => {
      const token = provideJwtService({ secret: { nope: true } } as unknown as JwtServiceOptions)

      await expect(container.get(token)).rejects.toMatchObject({
        code: DIErrorCode.InitializationError,
      })
    })
  })

  describe('string payloads', () => {
    it('should sign a string payload when the service has default signOptions', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        signOptions: { expiresIn: '15m', issuer: 'navios' },
      })

      const token = service.sign('hello')

      expect(service.decode<string>(token)).toBe('hello')
      expect(await service.signAsync('hello')).toBe(token)
    })

    it('should keep the default algorithm for a string payload', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        signOptions: { algorithm: 'HS512', expiresIn: '15m' },
      })

      expect(service.decode(service.sign('hello'), { complete: true })?.header.alg).toBe('HS512')
    })

    it('should reject claim options the caller passes with a string payload', async () => {
      const service = await createJwtService({ secret: 'test-secret' })

      expect(() =>
        // @ts-expect-error claim options are not allowed with a string payload
        service.sign('hello', { expiresIn: '1h' }),
      ).toThrow(/expiresIn/)
    })
  })

  describe('decode', () => {
    it('should return null for garbage', async () => {
      const service = await createJwtService({ secret: 'test-secret' })

      expect(service.decode('zzz')).toBeNull()
    })
  })
})
