import { LoggerOutput } from '@navios/core'
import { Container } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JwtServiceOptions } from '../index.mjs'
import type { JwtService } from '../jwt.service.mjs'

import {
  JsonWebTokenError,
  NotBeforeError,
  provideJwtService,
  TokenExpiredError,
} from '../index.mjs'

// Mock logger output
const mockLoggerOutput = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
  fatal: vi.fn(),
}

describe('JwtService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
    container.addInstance(LoggerOutput, mockLoggerOutput)
  })

  afterEach(async () => {
    await container.dispose()
  })

  // Helper to create JwtService with custom options
  async function createJwtService(options: JwtServiceOptions) {
    const JwtServiceToken = provideJwtService(options)
    return container.get(JwtServiceToken) as Promise<JwtService>
  }

  describe('sign', () => {
    it('should sign an object payload and create a valid token', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123', role: 'admin' }

      const token = service.sign(payload)

      expect(token).toBeTypeOf('string')
      expect(token.split('.')).toHaveLength(3) // JWT has 3 parts: header.payload.signature

      // Verify the token can be decoded and contains the payload
      const decoded = service.decode<typeof payload & { iat: number }>(token)
      expect(decoded).toBeDefined()
      expect(decoded?.userId).toBe('123')
      expect(decoded?.role).toBe('admin')
      expect(decoded?.iat).toBeTypeOf('number')
    })

    it('should sign a string payload with limited options', async () => {
      const service = await createJwtService({ secret: 'test-secret' })

      const token = service.sign('string-payload', { secret: 'test-secret' })

      expect(token).toBeTypeOf('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('should sign a Buffer payload', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = Buffer.from('buffer-payload')

      const token = service.sign(payload)

      expect(token).toBeTypeOf('string')
      expect(token.split('.')).toHaveLength(3)
    })

    it('should use method-level secret over instance secret', async () => {
      const service = await createJwtService({ secret: 'instance-secret' })
      const payload = { userId: '123' }

      // Sign with instance secret
      const token1 = service.sign(payload)
      const decoded1 = service.verify<typeof payload & { iat: number }>(
        token1,
        { secret: 'instance-secret' },
      )
      expect(decoded1.userId).toBe('123')

      // Sign with method-level secret
      const token2 = service.sign(payload, { secret: 'method-secret' })
      const decoded2 = service.verify<typeof payload & { iat: number }>(
        token2,
        { secret: 'method-secret' },
      )
      expect(decoded2.userId).toBe('123')

      // Verify that tokens signed with different secrets cannot be verified with the other secret
      expect(() => {
        service.verify(token2, { secret: 'instance-secret' })
      }).toThrow(JsonWebTokenError)
    })

    it('should include expiration when specified', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        signOptions: { expiresIn: '1h' },
      })
      const payload = { userId: '123' }

      const token = service.sign(payload)
      const decoded = service.decode<
        typeof payload & { iat: number; exp: number }
      >(token)

      expect(decoded?.exp).toBeTypeOf('number')
      expect(decoded?.exp).toBeGreaterThan(decoded?.iat ?? 0)
    })

    it('should include custom claims', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123', role: 'admin' }

      const token = service.sign(payload, {
        issuer: 'test-issuer',
        audience: 'test-audience',
        subject: 'test-subject',
      })

      const decoded = service.verify<
        typeof payload & { iss: string; aud: string; sub: string }
      >(token, {
        secret: 'test-secret',
        issuer: 'test-issuer',
        audience: 'test-audience',
      })

      expect(decoded.iss).toBe('test-issuer')
      expect(decoded.aud).toBe('test-audience')
      expect(decoded.sub).toBe('test-subject')
    })
  })

  describe('signAsync', () => {
    it('should sign an object payload asynchronously', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      const token = await service.signAsync(payload)

      expect(token).toBeTypeOf('string')
      expect(token.split('.')).toHaveLength(3)

      // Verify the token
      const decoded = await service.verifyAsync<
        typeof payload & { iat: number }
      >(token)
      expect(decoded.userId).toBe('123')
    })
  })

  describe('verify', () => {
    it('should verify and decode a valid token', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123', role: 'admin' }

      // Sign a token
      const token = service.sign(payload)

      // Verify the token
      const result = service.verify<typeof payload & { iat: number }>(token)

      expect(result.userId).toBe('123')
      expect(result.role).toBe('admin')
      expect(result.iat).toBeTypeOf('number')
    })

    it('should throw TokenExpiredError for expired tokens', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      // Sign a token that expires immediately
      const token = service.sign(payload, { expiresIn: '-1s' })

      // Wait a bit to ensure it's expired
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(() => {
        service.verify(token)
      }).toThrow(TokenExpiredError)
    })

    it('should throw JsonWebTokenError for invalid tokens', async () => {
      const service = await createJwtService({ secret: 'test-secret' })

      expect(() => {
        service.verify('invalid-token')
      }).toThrow(JsonWebTokenError)
    })

    it('should throw JsonWebTokenError for tokens signed with different secret', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      // Sign with one secret
      const token = service.sign(payload, { secret: 'secret-1' })

      // Try to verify with different secret
      expect(() => {
        service.verify(token, { secret: 'secret-2' })
      }).toThrow(JsonWebTokenError)
    })

    it('should use method-level secret over instance options', async () => {
      const service = await createJwtService({ secret: 'instance-secret' })
      const payload = { userId: '123' }

      // Sign with method-level secret
      const token = service.sign(payload, { secret: 'method-secret' })

      // Verify with method-level secret
      const result = service.verify<typeof payload & { iat: number }>(token, {
        secret: 'method-secret',
      })
      expect(result.userId).toBe('123')

      // Should fail with instance secret
      expect(() => {
        service.verify(token)
      }).toThrow(JsonWebTokenError)
    })

    it('should validate issuer when specified', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      const token = service.sign(payload, { issuer: 'test-issuer' })

      // Should verify with correct issuer
      const result = service.verify<typeof payload & { iss: string }>(token, {
        secret: 'test-secret',
        issuer: 'test-issuer',
      })
      expect(result.iss).toBe('test-issuer')

      // Should fail with wrong issuer
      expect(() => {
        service.verify(token, {
          secret: 'test-secret',
          issuer: 'wrong-issuer',
        })
      }).toThrow(JsonWebTokenError)
    })

    it('should validate audience when specified', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      const token = service.sign(payload, { audience: 'test-audience' })

      // Should verify with correct audience
      const result = service.verify<typeof payload & { aud: string }>(token, {
        secret: 'test-secret',
        audience: 'test-audience',
      })
      expect(result.aud).toBe('test-audience')

      // Should fail with wrong audience
      expect(() => {
        service.verify(token, {
          secret: 'test-secret',
          audience: 'wrong-audience',
        })
      }).toThrow(JsonWebTokenError)
    })

    it('should validate notBefore claim', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      // Sign a token that's not valid until 1 second from now
      const token = service.sign(payload, { notBefore: '1s' })

      // Should fail immediately
      expect(() => {
        service.verify(token)
      }).toThrow(NotBeforeError)

      // Should succeed after waiting
      await new Promise((resolve) => setTimeout(resolve, 1100))
      const result = service.verify<typeof payload & { iat: number }>(token)
      expect(result.userId).toBe('123')
    })
  })

  describe('verifyAsync', () => {
    it('should verify and decode a token asynchronously', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123', role: 'admin' }

      const token = service.sign(payload)

      const result = await service.verifyAsync<
        typeof payload & { iat: number }
      >(token)

      expect(result.userId).toBe('123')
      expect(result.role).toBe('admin')
      expect(result.iat).toBeTypeOf('number')
    })

    it('should reject when token is invalid', async () => {
      const service = await createJwtService({ secret: 'test-secret' })

      await expect(service.verifyAsync('invalid-token')).rejects.toThrow(
        JsonWebTokenError,
      )
    })

    it('should reject when token is expired', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      const token = service.sign(payload, { expiresIn: '-1s' })
      await new Promise((resolve) => setTimeout(resolve, 100))

      await expect(service.verifyAsync(token)).rejects.toThrow(
        TokenExpiredError,
      )
    })
  })

  describe('decode', () => {
    it('should decode a token without verification', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123', role: 'admin' }

      const token = service.sign(payload)

      const result = service.decode<typeof payload & { iat: number }>(token)

      expect(result).toBeDefined()
      expect(result?.userId).toBe('123')
      expect(result?.role).toBe('admin')
      expect(result?.iat).toBeTypeOf('number')
    })

    it('should decode with complete option', async () => {
      const service = await createJwtService({ secret: 'test-secret' })
      const payload = { userId: '123' }

      const token = service.sign(payload)

      const result = service.decode<{
        header: { alg: string; typ: string }
        payload: typeof payload & { iat: number }
      }>(token, { complete: true })

      expect(result).toBeDefined()
      expect(result?.header).toBeDefined()
      expect(result?.header.alg).toBe('HS256')
      expect(result?.header.typ).toBe('JWT')
      expect(result?.payload).toBeDefined()
      expect(result?.payload.userId).toBe('123')
    })

    it('should return null for invalid token format', async () => {
      const service = await createJwtService({})

      const result = service.decode('invalid-token-format')

      expect(result).toBeNull()
    })
  })

  describe('configuration', () => {
    it('should work with default empty options', async () => {
      const service = await createJwtService({})
      const payload = { userId: '123' }

      // Should use method-level secret since no instance secret
      const token = service.sign(payload, { secret: 'method-secret' })

      const decoded = service.verify<typeof payload & { iat: number }>(token, {
        secret: 'method-secret',
      })
      expect(decoded.userId).toBe('123')
    })

    it('should prioritize method secret over instance keys', async () => {
      const service = await createJwtService({
        secret: 'symmetric-secret',
        privateKey: 'private-key',
      })
      const payload = { userId: '123' }

      const token = service.sign(payload, { secret: 'method-secret' })

      // Should verify with method secret, not instance secret
      const decoded = service.verify<typeof payload & { iat: number }>(token, {
        secret: 'method-secret',
      })
      expect(decoded.userId).toBe('123')

      // Should not verify with instance secret
      expect(() => {
        service.verify(token)
      }).toThrow(JsonWebTokenError)
    })

    it('should use instance signOptions as defaults', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        signOptions: {
          issuer: 'default-issuer',
          audience: 'default-audience',
        },
      })
      const payload = { userId: '123' }

      const token = service.sign(payload)

      const decoded = service.verify<
        typeof payload & { iss: string; aud: string }
      >(token, {
        secret: 'test-secret',
        issuer: 'default-issuer',
        audience: 'default-audience',
      })
      expect(decoded.iss).toBe('default-issuer')
      expect(decoded.aud).toBe('default-audience')
    })

    it('should use instance verifyOptions as defaults', async () => {
      const service = await createJwtService({
        secret: 'test-secret',
        verifyOptions: {
          algorithms: ['HS256'],
        },
      })
      const payload = { userId: '123' }

      const token = service.sign(payload, { algorithm: 'HS256' })

      // Should verify using default algorithms from verifyOptions
      const decoded = service.verify<typeof payload & { iat: number }>(token)
      expect(decoded.userId).toBe('123')
    })
  })
})
