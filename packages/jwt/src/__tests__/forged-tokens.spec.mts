import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSecretKey,
  generateKeyPairSync,
} from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { JsonWebTokenError, JwtService } from '../index.mjs'

import type { Algorithm, JwtServiceOptions } from '../index.mjs'

const pem = {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
} as const

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, ...pem })
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', ...pem })

const SECRET = 's'.repeat(32)

const encode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

/** A token signed with HMAC over `key`, as an attacker who knows `key` makes it. */
function forge(key: string | Buffer, alg: 'HS256' | 'HS384' | 'HS512' = 'HS256') {
  const unsigned = `${encode({ alg, typ: 'JWT' })}.${encode({ sub: 'admin' })}`
  const mac = createHmac(`sha${alg.slice(2)}`, key)
    .update(unsigned)
    .digest('base64url')
  return `${unsigned}.${mac}`
}

function unsigned(alg: string) {
  return `${encode({ alg, typ: 'JWT' })}.${encode({ sub: 'admin' })}.`
}

function failureOf(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw')
}

/** A wrong configuration must not look like a wrong token: a guard answers 401 to the latter. */
function expectConfigurationError(run: () => unknown, message: RegExp) {
  const error = failureOf(run)
  expect(error).toBeInstanceOf(Error)
  expect(error).not.toBeInstanceOf(JsonWebTokenError)
  expect((error as Error).message).toMatch(message)
}

async function expectInvalidToken(service: JwtService, token: string, options = {}) {
  expect(failureOf(() => service.verify(token, options))).toBeInstanceOf(JsonWebTokenError)
  await expect(service.verifyAsync(token, options)).rejects.toBeInstanceOf(JsonWebTokenError)
}

const kinds = { rsa, ec }

for (const [kind, pair] of Object.entries(kinds)) {
  const publicKeyObject = createPublicKey(pair.publicKey)
  const der = publicKeyObject.export({ type: 'spki', format: 'der' })
  const jwk = JSON.stringify(publicKeyObject.export({ format: 'jwk' }))
  const pemText = pair.publicKey

  // The encodings a public key can be taken for an HMAC secret in: the
  // attacker signs with the bytes of the configured value.
  const parsed: Record<string, string | Buffer> = {
    'PEM string': pemText,
    'PEM Buffer': Buffer.from(pemText),
  }
  const unparsable: Record<string, string | Buffer> = {
    'DER Buffer': der,
    'DER Uint8Array': new Uint8Array(der) as Buffer,
    'PEM with literal \\n': pemText.replaceAll('\n', '\\n'),
    'base64 of the PEM': Buffer.from(pemText).toString('base64'),
    'base64 of the DER': der.toString('base64'),
    'JWK JSON': jwk,
    'empty string': '',
  }

  describe(`HMAC tokens forged with an ${kind} public key`, () => {
    for (const [encoding, key] of Object.entries(parsed)) {
      for (const alg of ['HS256', 'HS384', 'HS512'] as const) {
        it(`should reject an ${alg} token when publicKey is a ${encoding}`, async () => {
          await expectInvalidToken(new JwtService({ publicKey: key }), forge(key, alg))
        })
      }

      it(`should reject it when a ${encoding} is passed to the call`, async () => {
        await expectInvalidToken(new JwtService({}), forge(key), { publicKey: key })
        await expectInvalidToken(new JwtService({ secret: SECRET }), forge(key), { publicKey: key })
      })

      it(`should reject it when keys() returns a ${encoding}`, async () => {
        const algorithms: Algorithm[] = kind === 'rsa' ? ['RS256'] : ['ES256']
        await expectInvalidToken(
          new JwtService({ keys: () => key, verifyOptions: { algorithms } }),
          forge(key),
        )
        await expectInvalidToken(new JwtService({ keys: () => ({ key, algorithms }) }), forge(key))
      })
    }

    it('should reject it when the key is a KeyObject', async () => {
      await expectInvalidToken(new JwtService({ publicKey: publicKeyObject }), forge(pemText))
      await expectInvalidToken(new JwtService({ keys: () => publicKeyObject }), forge(pemText))
      await expectInvalidToken(new JwtService({}), forge(pemText), { publicKey: publicKeyObject })
      await expectInvalidToken(new JwtService({ publicKey: publicKeyObject }), forge(der))
    })

    it('should reject it when HMAC algorithms are pinned next to the public key', async () => {
      const algorithms: Algorithm[] = ['HS256', 'RS256', 'ES256']
      const service = new JwtService({ publicKey: pemText, verifyOptions: { algorithms } })

      await expectInvalidToken(service, forge(pemText))
      await expectInvalidToken(new JwtService({}), forge(pemText), {
        publicKey: pemText,
        algorithms,
      })
      await expectInvalidToken(
        new JwtService({ keys: () => publicKeyObject, verifyOptions: { algorithms } }),
        forge(pemText),
      )
    })

    for (const [encoding, key] of Object.entries(unparsable)) {
      it(`should not accept ${encoding} as a publicKey`, () => {
        expectConfigurationError(() => new JwtService({ publicKey: key }), /`publicKey`/)
        expectConfigurationError(
          () => new JwtService({}).verify(forge('anything'), { publicKey: key }),
          /`publicKey`/,
        )
      })

      it(`should not accept ${encoding} from keys()`, () => {
        const algorithms: Algorithm[] = ['RS256', 'ES256']
        const pinned = new JwtService({ keys: () => key, verifyOptions: { algorithms } })
        const pinnedByKey = new JwtService({ keys: () => ({ key, algorithms }) })
        const token = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ sub: 'admin' })}.AAAA`

        expectConfigurationError(() => pinned.verify(token), /`keys`/)
        expectConfigurationError(() => pinnedByKey.verify(token), /`keys`/)
      })
    }

    for (const [encoding, key] of Object.entries({ ...parsed, ...unparsable })) {
      it(`should not guess what ${encoding} from keys() is without pinned algorithms`, async () => {
        const service = new JwtService({ keys: () => key })
        const token = key.length === 0 ? forge('x') : forge(key as Buffer)

        expectConfigurationError(() => service.verify(token), /`keys`/)
        await expect(service.verifyAsync(token)).rejects.not.toBeInstanceOf(JsonWebTokenError)
      })

      it(`should not choose between HMAC and a signature for ${encoding} from keys()`, () => {
        const service = new JwtService({
          keys: () => key,
          verifyOptions: { algorithms: ['HS256', 'RS256', 'ES256'] },
        })

        expectConfigurationError(() => service.verify(forge('x')), /`keys`/)
      })
    }

    const misplaced: Record<string, string | Buffer> = {
      ...parsed,
      'PEM with leading whitespace': `\n  ${pemText}`,
      'PEM with literal \\n': unparsable['PEM with literal \\n']!,
      'base64 of the PEM': unparsable['base64 of the PEM']!,
      'JWK JSON': jwk,
    }
    for (const [encoding, key] of Object.entries(misplaced)) {
      it(`should not accept ${encoding} as a secret`, () => {
        expectConfigurationError(() => new JwtService({ secret: key }), /`secret`/)
        expectConfigurationError(
          () => new JwtService({}).verify(forge(key), { secret: key }),
          /`secret`/,
        )
        expectConfigurationError(
          () =>
            new JwtService({ keys: () => key, verifyOptions: { algorithms: ['HS256'] } }).verify(
              forge(key),
            ),
          /`keys`/,
        )
      })
    }

    it('should not accept a private key as a secret', () => {
      expectConfigurationError(() => new JwtService({ secret: pair.privateKey }), /`secret`/)
      expectConfigurationError(
        () => new JwtService({ secret: createPrivateKey(pair.privateKey) }),
        /`secret`/,
      )
      expectConfigurationError(() => new JwtService({ secret: publicKeyObject }), /`secret`/)
    })

    it('should not accept a secret KeyObject as a public or private key', () => {
      const secret = createSecretKey(Buffer.from(SECRET))

      expectConfigurationError(() => new JwtService({ publicKey: secret }), /`publicKey`/)
      expectConfigurationError(() => new JwtService({ privateKey: secret }), /`privateKey`/)
    })
  })
}

describe('unsigned tokens', () => {
  const configurations: Record<string, JwtServiceOptions> = {
    'a secret': { secret: SECRET },
    'an RSA public key': { publicKey: rsa.publicKey },
    'an EC public key': { publicKey: ec.publicKey },
    'a key function': { keys: () => createPublicKey(rsa.publicKey) },
    'a key function that knows no key': { keys: () => undefined },
    'an async key function that knows no key': { keys: async () => undefined },
  }

  for (const [name, options] of Object.entries(configurations)) {
    for (const alg of ['none', 'None', 'HS256', 'RS256', 'ES256']) {
      it(`should reject alg "${alg}" without a signature with ${name}`, async () => {
        const service = new JwtService(options)

        await expect(service.verifyAsync(unsigned(alg))).rejects.toBeInstanceOf(JsonWebTokenError)
      })
    }
  }

  it('should not accept "none" in any option', () => {
    const none = 'none' as Algorithm
    const service = new JwtService({ secret: SECRET })
    const token = unsigned('none')

    expectConfigurationError(
      () => new JwtService({ verifyOptions: { algorithms: ['HS256', none] } }),
      /algorithms/,
    )
    expectConfigurationError(
      () => new JwtService({ signOptions: { algorithm: none } }),
      /algorithm/,
    )
    expectConfigurationError(
      () => new JwtService({ signOptions: { header: { alg: 'none' } } }),
      /header/,
    )
    expectConfigurationError(() => service.verify(token, { algorithms: [none] }), /algorithms/)
    expectConfigurationError(() => service.sign({ a: 1 }, { algorithm: none }), /algorithm/)
    expectConfigurationError(() => service.sign({ a: 1 }, { header: { alg: 'none' } }), /header/)
    expectConfigurationError(
      () =>
        new JwtService({
          keys: () => ({ key: createPublicKey(rsa.publicKey), algorithms: ['RS256', none] }),
        }).verify(`${encode({ alg: 'RS256', typ: 'JWT' })}.e30.AAAA`),
      /`keys`/,
    )
  })

  it('should not verify anything without a key', async () => {
    const service = new JwtService({})

    for (const token of [unsigned('none'), unsigned('HS256'), forge('x')]) {
      expectConfigurationError(() => service.verify(token), /no key/)
      await expect(service.verifyAsync(token)).rejects.not.toBeInstanceOf(JsonWebTokenError)
    }
    expectConfigurationError(() => service.sign({ a: 1 }), /no key/)
    await expect(service.signAsync({ a: 1 })).rejects.toThrow(/no key/)
  })
})

describe('a kid that names something other than a usable key', () => {
  const ed = generateKeyPairSync('ed25519', pem)
  const secp256k1 = generateKeyPairSync('ec', { namedCurve: 'secp256k1', ...pem })
  const token = (kid?: string) => `${encode({ alg: 'RS256', typ: 'JWT', kid })}.e30.AAAA`
  const algorithms: Algorithm[] = ['RS256']

  async function expectFailure(keys: (kid: string) => unknown, kid: string, message: string) {
    const jwt = new JwtService({
      keys: ((request) =>
        keys(request.use === 'verify' ? request.header.kid! : '')) as JwtServiceOptions['keys'],
      verifyOptions: { algorithms },
    })
    const failures = [
      failureOf(() => jwt.verify(token(kid))),
      await jwt.verifyAsync(token(kid)).catch((error: unknown) => error),
    ]
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(JsonWebTokenError)
      expect((failure as Error).message).toBe(message)
    }
  }

  // What a plain object used as a table of keys answers
  for (const kid of ['nope', 'constructor', 'toString', '__proto__', '']) {
    it(`should be unknown for "${kid}"`, async () => {
      const table: Record<string, string> = { a: rsa.publicKey }

      await expectFailure((name) => table[name], kid, 'unknown key')
      await expectFailure((name) => ({ key: table[name], algorithms }), kid, 'unknown key')
    })
  }

  for (const [name, value] of Object.entries({
    null: null,
    'a number': 5,
    'a boolean': true,
    'an array': [],
    'a key without a value': { key: undefined },
    'a key that is null': { key: null, algorithms },
    'a key that is an object': { key: {}, algorithms: 'RS256' },
  })) {
    it(`should be unknown for ${name}`, async () => {
      await expectFailure(() => value, 'a', 'unknown key')
    })
  }

  for (const [name, value] of Object.entries({
    'an Ed25519 KeyObject': createPublicKey(ed.publicKey),
    'an Ed25519 PEM': { key: ed.publicKey, algorithms },
    'a KeyObject on another curve': { key: createPublicKey(secp256k1.publicKey) },
    'a key with the algorithm of a JWK we do not support': {
      key: createPublicKey(rsa.publicKey),
      algorithms: ['RSA-OAEP'],
    },
  })) {
    it(`should be an invalid algorithm for ${name}`, async () => {
      await expectFailure(() => value, 'a', 'invalid algorithm')
    })
  }

  it('should still be a configuration error to return an empty key', () => {
    for (const key of ['', Buffer.alloc(0), { key: '' }, { key: new Uint8Array(), algorithms }]) {
      const jwt = new JwtService({ keys: () => key, verifyOptions: { algorithms } })

      expectConfigurationError(() => jwt.verify(token('a')), /`keys`.*empty/)
    }
  })

  it('should be a configuration error when it is used to sign', () => {
    const expectSignError = (value: unknown, message: RegExp) =>
      expectConfigurationError(
        () => new JwtService({ keys: () => value as string }).sign({ sub: 'u' }),
        message,
      )

    expectSignError(Object, /`keys`/)
    expectSignError({ key: undefined }, /`keys`/)
    expectSignError(5, /`keys`/)
    expectSignError(createPrivateKey(ed.privateKey), /ed25519/)
    expectSignError({ key: createPrivateKey(rsa.privateKey), algorithms: ['EdDSA'] }, /algorithms/)
  })
})

describe('tokens an anonymous client can send', () => {
  const HS = { alg: 'HS256', typ: 'JWT' }
  const tokens: Record<string, unknown> = {
    'garbage in three parts': 'abc.def.ghi',
    'one letter in each part': 'a.b.c',
    'only dots': '..',
    'an empty string': '',
    'two parts': 'a.b',
    'four parts': 'a.b.c.d',
    'a header that is not JSON': `${encode('nope')}.${encode('{}')}.sig`,
    'a payload that is not JSON': `${encode(HS)}.${encode('nope')}.sig`,
    'a payload that is null': `${encode(HS)}.${encode('null')}.sig`,
    'a header that is null': `${encode('null')}.${encode('{}')}.sig`,
    'a header that is a number': `${encode('5')}.e30.sig`,
    'a header that is an array': `${encode('[]')}.e30.sig`,
    'an alg that is a number': `${encode({ alg: 5 })}.e30.sig`,
    'an alg that is an object': `${encode({ alg: { a: 1 } })}.e30.sig`,
    'no alg': `${encode({ typ: 'JWT' })}.e30.sig`,
    'a kid that is an object': `${encode({ ...HS, kid: { $ne: 1 } })}.e30.sig`,
    'an HMAC token without a signature': `${encode(HS)}.e30.`,
    'characters outside base64url': 'ы.ы.ы',
    'a short ES256 signature': `${encode({ alg: 'ES256', typ: 'JWT' })}.e30.${encode('short')}`,
    'an ES256 signature of zeros': `${encode({ alg: 'ES256', typ: 'JWT' })}.e30.${Buffer.alloc(64).toString('base64url')}`,
    'an RS256 token without a signature': `${encode({ alg: 'RS256', typ: 'JWT', kid: 'x' })}.e30.`,
    'an RS256 token with a short signature': `${encode({ alg: 'RS256', typ: 'JWT' })}.e30.AAAA`,
    'an algorithm that does not exist': `${encode({ alg: 'HS257', typ: 'JWT' })}.e30.AAAA`,
    undefined: undefined,
    null: null,
    'a number': 42,
    'an object': {},
  }
  const services: Record<string, JwtServiceOptions> = {
    'HS256 pinned': { secret: SECRET, verifyOptions: { algorithms: ['HS256'] } },
    'a secret': { secret: SECRET },
    'an EC key': { publicKey: ec.publicKey, verifyOptions: { algorithms: ['ES256'] } },
    'an RSA key with RS256 and ES256 pinned': {
      publicKey: rsa.publicKey,
      verifyOptions: { algorithms: ['RS256', 'ES256'] },
    },
    'a key function that knows no key': { keys: () => undefined },
    'a key function': {
      keys: () => createPublicKey(ec.publicKey),
      verifyOptions: { algorithms: ['RS256'] },
    },
    'an async key function': { keys: async () => createPublicKey(ec.publicKey) },
  }

  for (const [service, options] of Object.entries(services)) {
    for (const [name, token] of Object.entries(tokens)) {
      it(`should answer ${name} with a JsonWebTokenError when verifying with ${service}`, async () => {
        const jwt = new JwtService(options)

        await expect(jwt.verifyAsync(token as string)).rejects.toBeInstanceOf(JsonWebTokenError)
        if (service !== 'an async key function') {
          expect(failureOf(() => jwt.verify(token as string))).toBeInstanceOf(JsonWebTokenError)
        }
      })
    }
  }

  it('should decode every one of them to null or a value, without throwing', () => {
    const jwt = new JwtService({})

    for (const token of Object.values(tokens)) {
      expect(() => jwt.decode(token as string)).not.toThrow()
    }
    expect(jwt.decode(tokens['a payload that is not JSON'] as string)).toBeNull()
    expect(jwt.decode(undefined as unknown as string)).toBeNull()
  })

  it('should not ask keys() about a token it can reject by itself', () => {
    const asked: unknown[] = []
    const jwt = new JwtService({
      keys: (request) => {
        asked.push(request)
        return undefined
      },
      verifyOptions: { algorithms: ['RS256'] },
    })

    for (const token of [
      'abc.def.ghi',
      'a.b',
      unsigned('none'),
      forge('x'),
      tokens['a kid that is an object'] as string,
    ]) {
      expect(failureOf(() => jwt.verify(token))).toBeInstanceOf(JsonWebTokenError)
    }
    expect(asked).toEqual([])
  })

  it('should keep the error of the engine as the cause', () => {
    const jwt = new JwtService({ publicKey: ec.publicKey })
    const error = failureOf(() => jwt.verify(tokens['a short ES256 signature'] as string))

    expect((error as Error).cause).toBeInstanceOf(TypeError)
  })
})
