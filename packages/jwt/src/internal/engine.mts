import jwt from 'jsonwebtoken'

import { JsonWebTokenError, NotBeforeError, TokenExpiredError } from '../errors.mjs'

import type {
  Algorithm,
  JwtComplete,
  JwtDecodeOptions,
  JwtHeader,
  SignOptions,
  VerifyOptions,
} from '../token-options.mjs'

import { isAlgorithm } from './key.mjs'

import type { Key } from './key.mjs'

/*
 * The only module that knows `jsonwebtoken`. It is always given a `KeyObject` and the
 * algorithms that go with it, so it has no key type and no algorithm to guess.
 */

export function signToken(
  payload: string | Buffer | object,
  key: Key,
  algorithm: Algorithm,
  options: SignOptions,
): string {
  return jwt.sign(payload, key.object, { ...options, algorithm } as jwt.SignOptions)
}

export function verifyToken(
  token: string,
  key: Key,
  algorithms: readonly Algorithm[],
  options: VerifyOptions,
): JwtComplete<object> {
  let verified: jwt.Jwt
  try {
    verified = jwt.verify(token, key.object, {
      ...options,
      algorithms: algorithms as Algorithm[],
      complete: true,
    } as jwt.VerifyOptions & { complete: true })
  } catch (error) {
    throw toJwtError(error)
  }
  const { payload } = verified
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new JsonWebTokenError('jwt payload must be an object')
  }
  return verified as JwtComplete<object>
}

export function decodeToken(
  token: string,
  options: Omit<JwtDecodeOptions, 'complete'> & { complete?: boolean | undefined } = {},
): unknown {
  try {
    return jwt.decode(token, options as jwt.DecodeOptions)
  } catch {
    return null
  }
}

/**
 * Parses the header of a token that has not been verified, and rejects one that cannot be
 * verified whatever the key is.
 */
export function parseHeader(
  token: unknown,
  algorithms: readonly Algorithm[] | undefined,
): JwtHeader {
  if (typeof token !== 'string') {
    throw new JsonWebTokenError('jwt must be a string')
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new JsonWebTokenError('jwt malformed')
  }
  let header: JwtHeader | null
  try {
    header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString())
  } catch (cause) {
    throw new JsonWebTokenError('invalid token', { cause })
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new JsonWebTokenError('invalid token')
  }
  if (header.kid !== undefined && typeof header.kid !== 'string') {
    throw new JsonWebTokenError('invalid token')
  }
  if (!isAlgorithm(header.alg) || algorithms?.includes(header.alg) === false) {
    throw new JsonWebTokenError('invalid algorithm')
  }
  return header
}

// `jsonwebtoken` lets the errors of JSON.parse and of the signature decoder through. Whoever
// sends the token chooses them, so they are invalid tokens too.
function toJwtError(error: unknown): JsonWebTokenError {
  const options = { cause: error }
  if (error instanceof jwt.TokenExpiredError) {
    return new TokenExpiredError(error.message, error.expiredAt, options)
  }
  if (error instanceof jwt.NotBeforeError) {
    return new NotBeforeError(error.message, error.date, options)
  }
  const message = error instanceof jwt.JsonWebTokenError ? error.message : 'invalid token'
  return new JsonWebTokenError(message, options)
}
