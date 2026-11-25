import { createHmac, createPublicKey, createSecretKey, generateKeyPairSync } from 'node:crypto'

import { Container, DIErrorCode, LoggerOutput } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JsonWebTokenError,
  NotBeforeError,
  provideJwtService,
  RequestType,
  TokenExpiredError,
} from '../index.mjs'

import type { JwtServiceOptions } from '../index.mjs'
import type { JwtService } from '../jwt-service.mjs'

const mockLoggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

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
    container.addInstance(LoggerOutput, mockLoggerOutput)
  })

  afterEach(async () => {
    await container.dispose()
  })

  async function createJwtService(options: JwtServiceOptions) {
    return container.get(provideJwtService(options)) as Promise<JwtService>
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

      expect(service.decode(token, { complete: true }).header.alg).toBe('RS256')
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

    it('should reject it when the public key comes from the provider', async () => {
      const service = await createJwtService({ secretOrKeyProvider: async () => publicKey })

      await expect(service.verifyAsync(forgeHs256WithPublicKey())).rejects.toBeInstanceOf(
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

    it('should reject an unsigned token when no key is configured', async () => {
      const service = await createJwtService({})

      expect(() => service.verify(unsigned)).toThrow(JsonWebTokenError)
      await expect(service.verifyAsync(unsigned)).rejects.toBeInstanceOf(JsonWebTokenError)
    })

    it('should reject an unsigned token when an async provider resolves no key', async () => {
      const service = await createJwtService({
        secretOrKeyProvider: async () => undefined as unknown as string,
      })

      await expect(service.verifyAsync(unsigned)).rejects.toBeInstanceOf(JsonWebTokenError)
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

  describe('secretOrKeyProvider', () => {
    it('should use a synchronous provider for sync and async calls', async () => {
      const provider = vi.fn(() => 'provider-secret')
      const service = await createJwtService({ secretOrKeyProvider: provider })
      const reference = await createJwtService({ secret: 'provider-secret' })

      const token = service.sign({ a: 1 })
      const asyncToken = await service.signAsync({ a: 2 })

      expect(reference.verify<{ a: number }>(token).a).toBe(1)
      expect(reference.verify<{ a: number }>(asyncToken).a).toBe(2)
      expect(service.verify<{ a: number }>(token).a).toBe(1)
      expect((await service.verifyAsync<{ a: number }>(token)).a).toBe(1)
      expect(provider).toHaveBeenCalledWith(RequestType.Sign, { a: 1 }, {})
      expect(provider).toHaveBeenCalledWith(RequestType.Verify, token, {})
    })

    it('should await an asynchronous provider in signAsync and verifyAsync', async () => {
      const service = await createJwtService({
        secretOrKeyProvider: async (requestType) => {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return requestType === RequestType.Sign ? privateKey : publicKey
        },
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
      })

      const token = await service.signAsync({ sub: 'user' })

      expect((await service.verifyAsync<{ sub: string }>(token)).sub).toBe('user')
    })

    it('should reject a token signed with another key when the provider is asynchronous', async () => {
      const service = await createJwtService({ secretOrKeyProvider: async () => 'right' })
      const other = await createJwtService({ secret: 'wrong' })

      await expect(service.verifyAsync(other.sign({ a: 1 }))).rejects.toBeInstanceOf(
        JsonWebTokenError,
      )
    })

    it('should reject when an asynchronous provider rejects', async () => {
      const service = await createJwtService({
        secretOrKeyProvider: async () => {
          throw new Error('jwks unavailable')
        },
      })
      const token = (await createJwtService({ secret: 'k' })).sign({ a: 1 })

      await expect(service.verifyAsync(token)).rejects.toThrow('jwks unavailable')
      await expect(service.signAsync({ a: 1 })).rejects.toThrow('jwks unavailable')
    })

    it('should throw a clear error from sync sign and verify when the provider is asynchronous', async () => {
      const service = await createJwtService({ secretOrKeyProvider: async () => 'k' })
      const token = (await createJwtService({ secret: 'k' })).sign({ a: 1 })

      expect(() => service.sign({ a: 1 })).toThrow(/signAsync/)
      expect(() => service.verify(token)).toThrow(/verifyAsync/)
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

    it('should prefer a per-call secret over the provider', async () => {
      const provider = vi.fn(() => 'provider-secret')
      const service = await createJwtService({ secretOrKeyProvider: provider })
      const other = await createJwtService({ secret: 'other' })
      const providerToken = service.sign({ a: 1 })
      const otherToken = other.sign({ a: 2 })
      provider.mockClear()

      expect(service.verify<{ a: number }>(otherToken, { secret: 'other' }).a).toBe(2)
      expect(() => service.verify(providerToken, { secret: 'other' })).toThrow(JsonWebTokenError)
      expect(provider).not.toHaveBeenCalled()
    })

    it('should prefer the provider over the instance secret', async () => {
      const service = await createJwtService({
        secret: 'instance-secret',
        secretOrKeyProvider: () => 'provider-secret',
      })
      const instance = await createJwtService({ secret: 'instance-secret' })

      expect(() => service.verify(instance.sign({ a: 1 }))).toThrow(JsonWebTokenError)
    })

    it('should prefer the secret over the key within one level', async () => {
      const service = await createJwtService({ secret: 'hs-secret', privateKey, publicKey })

      const token = service.sign({ a: 1 })

      expect(service.decode(token, { complete: true }).header.alg).toBe('HS256')
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
        code: DIErrorCode.TokenValidationError,
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

      expect(service.verify(token)).toBe('hello')
      expect(await service.signAsync('hello')).toBe(token)
    })

    it('should keep the default algorithm for a string payload', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        signOptions: { algorithm: 'HS512', expiresIn: '15m' },
      })

      expect(service.decode(service.sign('hello'), { complete: true }).header.alg).toBe('HS512')
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
