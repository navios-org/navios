import {
  createPrivateKey,
  createPublicKey,
  createSecretKey,
  generateKeyPairSync,
} from 'node:crypto'
import { inspect } from 'node:util'

import { ConsoleLogger, Container, DIErrorCode } from '@navios/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JsonWebTokenError, JwtService, provideJwtService } from '../index.mjs'

import type { JwtServiceOptions } from '../index.mjs'

const SECRET = 'TOP-SECRET-VALUE-of-32-bytes-000'

const pem = {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
} as const
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, ...pem })
const pss = (hashAlgorithm?: string) =>
  generateKeyPairSync('rsa-pss', {
    modulusLength: 2048,
    ...(hashAlgorithm === undefined ? {} : { hashAlgorithm, mgf1HashAlgorithm: hashAlgorithm }),
    ...pem,
  })
const ec = (namedCurve: string) => generateKeyPairSync('ec', { namedCurve, ...pem })
const ed = generateKeyPairSync('ed25519', pem)

function configurationError(options: unknown): Error {
  try {
    new JwtService(options as JwtServiceOptions)
  } catch (error) {
    expect(error).not.toBeInstanceOf(JsonWebTokenError)
    return error as Error
  }
  throw new Error('expected the constructor to throw')
}

describe('configuration', () => {
  let emitWarning: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
  })

  afterEach(() => {
    emitWarning.mockRestore()
  })

  describe('a key that is missing', () => {
    for (const slot of ['secret', 'publicKey', 'privateKey'] as const) {
      for (const [name, value] of Object.entries({
        undefined: undefined,
        null: null,
        'an empty string': '',
        'an empty Buffer': Buffer.alloc(0),
        'an empty Uint8Array': new Uint8Array(),
      })) {
        it(`should refuse ${slot} set to ${name}`, () => {
          expect(configurationError({ [slot]: value }).message).toMatch(
            new RegExp(`\`${slot}\`.*(empty|no value).*environment variable`),
          )
        })
      }
    }

    it('should refuse an empty secret KeyObject', () => {
      expect(configurationError({ secret: createSecretKey(Buffer.alloc(0)) }).message).toMatch(
        /`secret`/,
      )
    })

    it('should accept a service without keys', () => {
      const service = new JwtService({})
      const token = service.sign({ sub: 'u' }, { secret: SECRET })

      expect(service.verify(token, { secret: SECRET }).sub).toBe('u')
    })

    it('should report a missing secret when the service is resolved', async () => {
      const container = new Container()
      try {
        await expect(
          container.get(provideJwtService({ secret: process.env.THIS_IS_NOT_SET })),
        ).rejects.toMatchObject({
          code: DIErrorCode.InitializationError,
          message: expect.stringMatching(/`secret`/),
        })
      } finally {
        await container.dispose()
      }
    })
  })

  describe('an option that is missing', () => {
    it('should refuse sign and verify options without a value', () => {
      const unset = process.env.THIS_IS_NOT_SET

      expect(
        configurationError({ secret: SECRET, signOptions: { expiresIn: unset } }).message,
      ).toMatch(/expiresIn/)
      expect(
        configurationError({ secret: SECRET, verifyOptions: { audience: unset } }).message,
      ).toMatch(/audience/)
    })

    it('should accept optional parts of the configuration set to undefined', () => {
      const service = new JwtService({
        secret: SECRET,
        signOptions: undefined,
        verifyOptions: undefined,
        keys: undefined,
      })

      expect(service.verify(service.sign({ sub: 'u' })).sub).toBe('u')
    })
  })

  describe('the wrong shape', () => {
    it('should be refused', () => {
      for (const options of [
        undefined,
        null,
        'secret',
        { secret: 42 },
        { secret: { nope: true } },
        { publicKey: 5 },
        { publicKey: { key: rsa.publicKey } },
        { privateKey: { passphrase: 'x' } },
        { signOptions: 'x' },
        { verifyOptions: [] },
        { keys: {} },
      ]) {
        expect(configurationError(options)).toBeInstanceOf(Error)
      }
    })

    it('should be refused naming the slot of a key that cannot be parsed', () => {
      expect(configurationError({ privateKey: 'private-key' }).message).toMatch(/`privateKey`/)
      expect(configurationError({ publicKey: 'public-key' }).message).toMatch(/`publicKey`/)
      expect(
        configurationError({ publicKey: rsa.publicKey.replaceAll('\n', '\\n') }).message,
      ).toMatch(/`publicKey`.*\\n/)
    })

    it('should be refused for a key type without a supported algorithm', () => {
      expect(configurationError({ publicKey: ed.publicKey }).message).toMatch(/ed25519/)
      expect(configurationError({ privateKey: ec('secp256k1').privateKey }).message).toMatch(
        /secp256k1/,
      )
      expect(configurationError({ publicKey: pss().publicKey }).message).toMatch(/RSA-PSS/)
    })

    it('should be refused for an algorithm that is not supported', () => {
      expect(
        configurationError({ secret: SECRET, signOptions: { algorithm: 'EdDSA' } }).message,
      ).toMatch(/algorithm/)
    })
  })

  describe('keys', () => {
    const pairs = {
      RS256: rsa,
      PS256: pss('sha256'),
      PS512: pss('sha512'),
      ES256: ec('prime256v1'),
      ES384: ec('secp384r1'),
      ES512: ec('secp521r1'),
    }

    for (const [alg, pair] of Object.entries(pairs)) {
      it(`should sign with ${alg} and verify by key type without pinned algorithms`, async () => {
        const services = [
          new JwtService(pair),
          new JwtService({
            privateKey: Buffer.from(pair.privateKey),
            publicKey: Buffer.from(pair.publicKey),
          }),
          new JwtService({
            privateKey: createPrivateKey(pair.privateKey),
            publicKey: createPublicKey(pair.publicKey),
          }),
          // The public half is part of the private key.
          new JwtService({
            privateKey: pair.privateKey,
            publicKey: createPrivateKey(pair.privateKey),
          }),
        ]
        for (const signer of services) {
          const token = signer.sign({ sub: 'u' })
          expect(signer.decode(token, { complete: true })?.header.alg).toBe(alg)
          for (const verifier of services) {
            expect(verifier.verify(token).sub).toBe('u')
            expect((await verifier.verifyAsync(await signer.signAsync({ sub: 'a' }))).sub).toBe('a')
          }
        }
      })
    }

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: pem.publicKeyEncoding,
      privateKeyEncoding: {
        ...pem.privateKeyEncoding,
        cipher: 'aes-256-cbc',
        passphrase: 'open sesame',
      },
    })

    it('should accept an encrypted private key', () => {
      const service = new JwtService({
        privateKey: { key: privateKey, passphrase: 'open sesame' },
        publicKey,
      })

      expect(service.verify(service.sign({ sub: 'u' })).sub).toBe('u')
      expect(
        service.verify(
          service.sign(
            { sub: 'u' },
            { privateKey: { key: privateKey, passphrase: 'open sesame' } },
          ),
        ).sub,
      ).toBe('u')
      const plain = new JwtService({ privateKey: { key: rsa.privateKey, passphrase: '' } })
      expect(plain.sign({ sub: 'u' })).toBeTypeOf('string')
    })

    it('should say what is wrong with the passphrase of a private key', () => {
      const messageFor = (key: unknown) => {
        const error = configurationError({ privateKey: key })
        expect(inspect(error)).not.toContain('WRONG-PASS')
        expect(error.message).not.toMatch(/PEM encoding|pkcs8/)
        return error.message
      }

      const missing = /`privateKey` is encrypted.*passphrase.*\{ key, passphrase \}/
      expect(messageFor(privateKey)).toMatch(missing)
      expect(messageFor(Buffer.from(privateKey))).toMatch(missing)
      expect(messageFor({ key: privateKey, passphrase: '' })).toMatch(missing)
      expect(messageFor({ key: privateKey, passphrase: 'WRONG-PASS' })).toMatch(
        /`privateKey` cannot be decrypted with its passphrase/,
      )
      expect(configurationError({ publicKey: privateKey }).message).toMatch(/not a public key/)
      for (const passphrase of [undefined, null]) {
        const message = messageFor({ key: rsa.privateKey, passphrase })
        expect(message).toMatch(/passphrase of `privateKey` is empty.*environment variable/)
      }
      for (const key of [{ key: rsa.privateKey }, { key: rsa.privateKey, passphrase: 5 }]) {
        expect(messageFor(key)).toMatch(/`privateKey` must be .* or \{ key, passphrase \}/)
      }
    })

    it('should read the key once, when the service is created', () => {
      const secret = Buffer.from(SECRET)
      const service = new JwtService({ secret })
      const token = service.sign({ sub: 'u' })
      secret.fill(0)

      expect(service.verify(token).sub).toBe('u')
      expect(service.verify(token, { secret: SECRET }).sub).toBe('u')
    })

    it('should not see changes of the configuration object', () => {
      const options: JwtServiceOptions = { secret: SECRET, signOptions: { issuer: 'a' } }
      const service = new JwtService(options)
      options.signOptions!.issuer = 'b'
      options.secret = 'z'.repeat(32)

      expect(service.verify(service.sign({}), { secret: SECRET }).iss).toBe('a')
    })
  })

  describe('a short HMAC secret', () => {
    // The warning is given once per process, so each test starts with a new one
    let Service: typeof JwtService

    beforeEach(async () => {
      vi.resetModules()
      Service = (await import('../index.mjs')).JwtService
    })

    it('should be reported once per process, when a service is created', () => {
      const service = new Service({ secret: 'a' })
      service.verify(service.sign({ sub: 'u' }))
      new Service({ secret: 'b' })

      expect(emitWarning).toHaveBeenCalledTimes(1)
      expect(emitWarning.mock.calls[0]![0]).toMatch(/32 bytes/)
      expect(emitWarning.mock.calls[0]![0]).not.toContain("'a'")
    })

    for (const [name, secret] of Object.entries({
      bytes: Buffer.alloc(31, 1),
      'a key object': createSecretKey(Buffer.alloc(31, 1)),
    })) {
      it(`should be reported for ${name}`, () => {
        new Service({ secret })

        expect(emitWarning).toHaveBeenCalledTimes(1)
      })
    }

    it('should not be reported for 32 bytes, for a key pair or for a key of a call', () => {
      new Service({ secret: SECRET })
      new Service({ secret: 'ü'.repeat(16) })
      new Service(rsa)
      new Service({}).sign({ a: 1 }, { secret: 'a' })

      expect(emitWarning).not.toHaveBeenCalled()
    })
  })

  describe('secrets in output', () => {
    const service = new JwtService({ secret: SECRET, signOptions: { issuer: 'me' } })

    it('should not be part of an inspected or serialised service', () => {
      expect(inspect(service, { depth: 10, showHidden: true })).not.toContain(SECRET)
      expect(JSON.stringify({ service })).not.toContain(SECRET)
      expect(Object.keys(service)).toEqual([])
    })

    it('should not be part of a log record', () => {
      const written: string[] = []
      const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        written.push(String(chunk))
        return true
      })
      try {
        ConsoleLogger.create({ colors: false }).log({ auth: { jwt: service } })
      } finally {
        write.mockRestore()
      }
      expect(written.join('')).toContain('jwt')
      expect(written.join('')).not.toContain(SECRET)
    })

    it('should not be part of a configuration error', async () => {
      const wrong: JwtServiceOptions[] = [
        { secret: SECRET, publicKey: 5 as unknown as string },
        { secret: SECRET, publicKey: 'not a key' },
        { privateKey: SECRET },
        { privateKey: { key: SECRET, passphrase: SECRET } },
        { secret: { value: SECRET } as unknown as string },
        { secret: `-----BEGIN ${SECRET}` },
        { secret: SECRET, verifyOptions: { audience: '' } },
      ]
      const container = new Container()
      try {
        for (const options of wrong) {
          const error = await container.get(provideJwtService(options)).then(
            () => {
              throw new Error('expected the service not to resolve')
            },
            (reason: unknown) => reason,
          )
          expect(inspect(error, { depth: 10, showHidden: true })).not.toContain(SECRET)
        }
      } finally {
        await container.dispose()
      }
    })
  })
})
