import type { Secret as JwtSecret } from 'jsonwebtoken'

/**
 * Supported JWT algorithms.
 *
 * Includes symmetric (HMAC) and asymmetric (RSA, ECDSA, RSA-PSS) algorithms.
 */
export type Algorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'none'

/**
 * JWT header type.
 *
 * Contains algorithm, type, and optional header claims.
 */
export interface JwtHeader {
  alg: Algorithm | (string & {})
  typ?: string
  cty?: string
  crit?: string[]
  kid?: string
  jku?: string
  x5u?: string | string[]
  'x5t#S256'?: string
  x5t?: string
  x5c?: string | string[]
}

/**
 * Options for signing JWT tokens: algorithm, expiration, audience, issuer and
 * the other standard JWT claims.
 */
export interface SignOptions {
  algorithm?: Algorithm
  keyid?: string
  expiresIn?: string | number
  notBefore?: string | number
  audience?: string | RegExp | (string | RegExp)[]
  subject?: string
  issuer?: string
  jwtid?: string
  mutatePayload?: boolean
  noTimestamp?: boolean
  header?: JwtHeader
  encoding?: string
  allowInsecureKeySizes?: boolean
  allowInvalidAsymmetricKeyTypes?: boolean
}

/**
 * Options for verifying JWT tokens: allowed algorithms, audience, issuer,
 * expiration handling and the other validation rules.
 */
export interface VerifyOptions {
  algorithms?: Algorithm[]
  audience?: string | RegExp | (string | RegExp)[]
  clockTimestamp?: number
  clockTolerance?: number
  complete?: boolean
  issuer?: string | string[]
  ignoreExpiration?: boolean
  ignoreNotBefore?: boolean
  jwtid?: string
  nonce?: string
  subject?: string
  maxAge?: string | number
  allowInvalidAsymmetricKeyTypes?: boolean
}

/**
 * Secret or key type for JWT operations.
 *
 * Can be a string, a Buffer, a key object (for example a Node.js `KeyObject`)
 * or an object with a key and its passphrase.
 */
export type Secret =
  | string
  | Buffer
  | { type: string; [key: string]: unknown }
  | { key: string | Buffer; passphrase: string }

/**
 * Options for signing JWT tokens.
 *
 * Extends `SignOptions` with additional properties for specifying
 * the secret or private key to use for signing.
 *
 * @property secret - Secret key for symmetric algorithms (overrides service default)
 * @property privateKey - Private key for asymmetric algorithms (overrides service default)
 */
export interface JwtSignOptions extends SignOptions {
  /** Secret key for symmetric algorithms */
  secret?: string | Buffer
  /** Private key for asymmetric algorithms */
  privateKey?: Secret
}

/**
 * Options for verifying JWT tokens.
 *
 * Extends `VerifyOptions` with additional properties for specifying
 * the secret or public key to use for verification.
 *
 * @property secret - Secret key for symmetric algorithms (overrides service default)
 * @property publicKey - Public key for asymmetric algorithms (overrides service default)
 */
export interface JwtVerifyOptions extends VerifyOptions {
  /** Secret key for symmetric algorithms */
  secret?: string | Buffer
  /** Public key for asymmetric algorithms */
  publicKey?: string | Buffer
}

/**
 * Result type for secret/key resolution.
 *
 * Represents the possible return types from secret or key provider functions.
 */
export type GetSecretKeyResult = string | Buffer | JwtSecret
