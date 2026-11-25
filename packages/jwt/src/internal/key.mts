import { createPrivateKey, createPublicKey, createSecretKey, KeyObject } from 'node:crypto'

import type { Algorithm } from '../token-options.mjs'

const HMAC: readonly Algorithm[] = ['HS256', 'HS384', 'HS512']
const RSA: readonly Algorithm[] = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']
const PSS_BY_HASH = new Map<string | undefined, Algorithm>([
  ['sha256', 'PS256'],
  ['sha384', 'PS384'],
  ['sha512', 'PS512'],
])
const EC_BY_CURVE = new Map<string | undefined, Algorithm>([
  ['prime256v1', 'ES256'],
  ['secp384r1', 'ES384'],
  ['secp521r1', 'ES512'],
])

const ALGORITHMS = new Set<unknown>([...HMAC, ...RSA, ...EC_BY_CURVE.values()])

export function isAlgorithm(value: unknown): value is Algorithm {
  return ALGORITHMS.has(value)
}

/**
 * A key that has been parsed as what it was configured as. Nothing is left to guess for the
 * code that uses it: a public key cannot end up as the secret of an HMAC.
 */
export interface Key {
  readonly object: KeyObject
  /** What the type of the key allows. */
  readonly algorithms: readonly Algorithm[]
  /** How the key is called in an error message. */
  readonly label: string
}

/**
 * An error in what the application passes, as opposed to what a token contains. It is not a
 * `JsonWebTokenError`, which a guard answers with 401.
 */
export function configurationError(message: string): Error {
  return new Error(`[JwtService] ${message}`)
}

/** A configuration error: the key is one, but no supported algorithm works with its type. */
export class UnsupportedKeyError extends Error {
  constructor(reason: string) {
    super(`[JwtService] ${reason}`)
  }
}

export function parseSecret(value: unknown, label: string): Key {
  if (value instanceof KeyObject) {
    if (value.type !== 'secret') {
      throw configurationError(`${label} must be a secret, but is a ${value.type} key`)
    }
    if (value.symmetricKeySize === 0) {
      throw emptyKey(label)
    }
    return createKey(value, label)
  }
  const bytes = toBuffer(value, label)
  if (looksAsymmetric(bytes)) {
    throw configurationError(
      `${label} must be a secret, but is an encoded key. Configure a key pair with \`publicKey\` and \`privateKey\``,
    )
  }
  return createKey(createSecretKey(bytes), label)
}

export function parsePublicKey(value: unknown, label: string): Key {
  if (value instanceof KeyObject) {
    if (value.type === 'secret') {
      throw configurationError(`${label} must be a public key, but is a secret`)
    }
    return createKey(value.type === 'private' ? createPublicKey(value) : value, label)
  }
  const bytes = toBuffer(value, label)
  return createKey(
    parse(() => createPublicKey(bytes), bytes, label, 'public'),
    label,
  )
}

export function parsePrivateKey(value: unknown, label: string): Key {
  if (value instanceof KeyObject) {
    if (value.type !== 'private') {
      throw configurationError(`${label} must be a private key, but is a ${value.type} key`)
    }
    return createKey(value, label)
  }
  const { key, passphrase } = hasPassphrase(value) ? value : { key: value, passphrase: '' }
  if (passphrase === undefined || passphrase === null) {
    throw emptyKey(`the passphrase of ${label}`)
  }
  if (typeof passphrase !== 'string' || (isObject(key) && !(key instanceof Uint8Array))) {
    throw configurationError(
      `${label} must be a string, a Uint8Array, a KeyObject or { key, passphrase }`,
    )
  }
  const bytes = toBuffer(key, label)
  if (bytes.includes('ENCRYPTED') && passphrase === '') {
    throw configurationError(
      `${label} is encrypted, and needs its passphrase. Pass { key, passphrase }, or the KeyObject of createPrivateKey({ key, passphrase })`,
    )
  }
  return createKey(
    parse(
      () => createPrivateKey(passphrase === '' ? bytes : { key: bytes, passphrase }),
      bytes,
      label,
      'private',
    ),
    label,
  )
}

/** A secret shorter than the output of SHA-256 is weaker than the HMAC made with it (RFC 7518, 3.2). */
export function isShortSecret({ object }: Key): boolean {
  return object.type === 'secret' && object.symmetricKeySize! < 32
}

function createKey(object: KeyObject, label: string): Key {
  return { object, algorithms: algorithmsOf(object, label), label }
}

function algorithmsOf(key: KeyObject, label: string): readonly Algorithm[] {
  if (key.type === 'secret') {
    return HMAC
  }
  const details = key.asymmetricKeyDetails ?? {}
  switch (key.asymmetricKeyType) {
    case 'rsa':
      return RSA
    case 'rsa-pss': {
      const algorithm = PSS_BY_HASH.get(details.hashAlgorithm)
      if (
        algorithm !== undefined &&
        details.mgf1HashAlgorithm === details.hashAlgorithm &&
        (details.saltLength ?? 0) <= Number(algorithm.slice(2)) / 8
      ) {
        return [algorithm]
      }
      throw new UnsupportedKeyError(
        `${label} is an RSA-PSS key whose parameters match none of PS256, PS384 and PS512`,
      )
    }
    case 'ec': {
      const algorithm = EC_BY_CURVE.get(details.namedCurve)
      if (algorithm !== undefined) {
        return [algorithm]
      }
      throw new UnsupportedKeyError(
        `${label} is on the curve ${details.namedCurve}, which is not supported`,
      )
    }
    default:
      throw new UnsupportedKeyError(
        `${label} is an ${key.asymmetricKeyType} key, which is not supported. Use RSA, RSA-PSS or ECDSA`,
      )
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function hasPassphrase(value: unknown): value is { key: unknown; passphrase: unknown } {
  return isObject(value) && 'passphrase' in value
}

function toBuffer(value: unknown, label: string): Buffer {
  if (value === undefined || value === null || value === '') {
    throw emptyKey(label)
  }
  if (typeof value === 'string') {
    return Buffer.from(value)
  }
  if (value instanceof Uint8Array) {
    if (value.byteLength === 0) {
      throw emptyKey(label)
    }
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  throw configurationError(`${label} must be a string, a Uint8Array or a KeyObject`)
}

function emptyKey(label: string): Error {
  return configurationError(`${label} is empty. Is an environment variable missing?`)
}

// Neither the value nor the error of `node:crypto` becomes part of the message or the cause:
// both may contain key material.
function parse(
  create: () => KeyObject,
  bytes: Buffer,
  label: string,
  kind: 'public' | 'private',
): KeyObject {
  try {
    return create()
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'unknown error'
    if (kind === 'private' && bytes.includes('ENCRYPTED')) {
      throw configurationError(`${label} cannot be decrypted with its passphrase (${code})`)
    }
    const hint = bytes.includes('\\n')
      ? `It contains the characters \\n instead of line breaks; replace them, for example with key.replaceAll('\\\\n', '\\n')`
      : `For another encoding pass a KeyObject, for example create${kind === 'public' ? 'Public' : 'Private'}Key({ key, format: 'der', type: '${kind === 'public' ? 'spki' : 'pkcs8'}' })`
    throw configurationError(`${label} is not a ${kind} key in PEM encoding (${code}). ${hint}`)
  }
}

// A PEM, the base64 of a PEM, or a JWK: what a public key looks like in an environment
// variable. Anyone who knows the public key could sign with such a "secret".
const ASYMMETRIC = /^\s*(?:-----BEGIN|LS0tLS1CRUdJ|\{[^]*"kty")/

function looksAsymmetric(bytes: Buffer): boolean {
  return ASYMMETRIC.test(bytes.toString('latin1'))
}
