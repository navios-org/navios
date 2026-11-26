import { KeyObject } from 'node:crypto'

import { JsonWebTokenError } from '../errors.mjs'

import type { JwtKeyMaterial, JwtKeyRequest, JwtServiceOptions } from '../jwt-service-options.mjs'
import type { Algorithm, JwtKey } from '../token-options.mjs'

import {
  configurationError,
  isAlgorithm,
  parsePrivateKey,
  parsePublicKey,
  parseSecret,
  UnsupportedKeyError,
} from './key.mjs'

import type { Key } from './key.mjs'

export type KeysFunction = NonNullable<JwtServiceOptions['keys']>

/** The key of one call, with what `keys` said about it. */
export interface SelectedKey {
  key: Key
  keyid?: string | undefined
  algorithms?: readonly Algorithm[] | undefined
  /** Chosen by `keys`, so for a token by what its sender put into the header. */
  fromKeys?: boolean
}

const LABEL = 'the key returned by `keys`'

/**
 * Asks the `keys` function of a configuration. `pinned` are the algorithms the options allow.
 */
export function askKeys(
  keys: KeysFunction,
  request: JwtKeyRequest,
  pinned: readonly Algorithm[] | undefined,
): SelectedKey | Promise<SelectedKey> {
  const material = keys(request)
  if (typeof (material as Partial<PromiseLike<unknown>> | undefined)?.then === 'function') {
    return Promise.resolve(material).then((resolved) => readMaterial(resolved, request.use, pinned))
  }
  return readMaterial(material as JwtKeyMaterial | undefined, request.use, pinned)
}

export function intersect(
  algorithms: readonly Algorithm[],
  other: readonly Algorithm[] | undefined,
): readonly Algorithm[] {
  return other === undefined ? algorithms : algorithms.filter((name) => other.includes(name))
}

function readMaterial(
  material: unknown,
  use: JwtKeyRequest['use'],
  pinned: readonly Algorithm[] | undefined,
): SelectedKey {
  if (material === undefined || material === null) {
    throw use === 'verify'
      ? new JsonWebTokenError('unknown key')
      : configurationError('`keys` returned no key to sign with')
  }
  if (isKey(material)) {
    return { key: parseMaterial(material, use, pinned ?? []), fromKeys: true }
  }
  const { key, keyid, algorithms } = material as Exclude<JwtKeyMaterial, JwtKey>
  if (use === 'verify' && !isKey(key)) {
    // The sender of the token chooses what is looked up. A table that is a plain object has
    // something for "constructor" and "__proto__" too.
    throw new JsonWebTokenError('unknown key')
  }
  if (algorithms === undefined) {
    return { key: parseMaterial(key as JwtKey, use, pinned ?? []), keyid, fromKeys: true }
  }
  if (use === 'verify' && isListOfOtherAlgorithms(algorithms)) {
    // Such as the EdDSA or RSA-OAEP key of a JWKS
    throw new JsonWebTokenError('invalid algorithm')
  }
  if (!Array.isArray(algorithms) || algorithms.length === 0 || !algorithms.every(isAlgorithm)) {
    throw configurationError(
      '`algorithms` returned by `keys` must be a non-empty array of supported algorithms',
    )
  }
  return { key: parseMaterial(key as JwtKey, use, algorithms), keyid, algorithms, fromKeys: true }
}

function isKey(value: unknown): value is JwtKey {
  return typeof value === 'string' || value instanceof Uint8Array || value instanceof KeyObject
}

function isListOfOtherAlgorithms(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((name) => typeof name === 'string' && !isAlgorithm(name))
  )
}

/**
 * Text and bytes do not say what they are. Only the algorithms the application allows decide
 * it, never the header of the token.
 */
function parseMaterial(
  value: JwtKey,
  use: JwtKeyRequest['use'],
  allowed: readonly Algorithm[],
): Key {
  if (value instanceof KeyObject) {
    if (value.type === 'secret') {
      return parseSecret(value, LABEL)
    }
  } else if (typeof value === 'string' || value instanceof Uint8Array) {
    const hmac = allowed.filter((algorithm) => algorithm.startsWith('HS')).length
    if (allowed.length === 0 || (hmac > 0 && hmac < allowed.length)) {
      throw configurationError(
        `${LABEL} is text or bytes, which can be a secret or a ${use === 'sign' ? 'private' : 'public'} key. ` +
          'Return a KeyObject, or say which it is with `algorithms` that are either all HS or none HS',
      )
    }
    if (hmac > 0) {
      return parseSecret(value, LABEL)
    }
  }
  if (use === 'sign') {
    return parsePrivateKey(value, LABEL)
  }
  try {
    return parsePublicKey(value, LABEL)
  } catch (cause) {
    throw cause instanceof UnsupportedKeyError
      ? new JsonWebTokenError('invalid algorithm', { cause })
      : cause
  }
}
