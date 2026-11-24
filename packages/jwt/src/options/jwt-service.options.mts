import type { StandardSchemaV1 } from '@navios/core'
import type { Secret as JwtSecret } from 'jsonwebtoken'

/**
 * Request type for secret or key provider functions.
 *
 * Used to distinguish between signing and verification operations when
 * dynamically resolving secrets or keys.
 */
export enum RequestType {
  /** Request is for signing a token */
  Sign = 'Sign',
  /** Request is for verifying a token */
  Verify = 'Verify',
}

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
 * Configuration options for the JWT service.
 *
 * @property signOptions - Default options for signing tokens
 * @property secret - Default secret for symmetric algorithms (HS256, HS384, HS512)
 * @property publicKey - Default public key for asymmetric algorithms (RS256, ES256, etc.)
 * @property privateKey - Default private key for asymmetric algorithms
 * @property verifyOptions - Default options for verifying tokens
 * @property secretOrKeyProvider - Optional function to dynamically resolve secrets/keys
 *
 * @example
 * ```ts
 * const options: JwtServiceOptions = {
 *   secret: 'your-secret-key',
 *   signOptions: {
 *     expiresIn: '1h',
 *     algorithm: 'HS256',
 *   },
 *   verifyOptions: {
 *     algorithms: ['HS256'],
 *   },
 * }
 * ```
 */
export interface JwtServiceOptions {
  signOptions?: SignOptions
  secret?: string
  publicKey?: string | Buffer
  privateKey?: Secret
  verifyOptions?: VerifyOptions
  secretOrKeyProvider?: (
    requestType: RequestType,
    tokenOrPayload: any,
    options?: SignOptions | VerifyOptions,
  ) => Secret
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value)
}

function isKey(value: unknown): boolean {
  return typeof value === 'string' || Buffer.isBuffer(value)
}

function isJwtServiceOptions(value: unknown): value is JwtServiceOptions {
  if (!isPlainObject(value)) {
    return false
  }
  return (
    isOptional(value.secret, (v) => typeof v === 'string') &&
    isOptional(value.publicKey, isKey) &&
    isOptional(value.privateKey, (v) => isKey(v) || isPlainObject(v)) &&
    isOptional(value.signOptions, isPlainObject) &&
    isOptional(value.verifyOptions, isPlainObject) &&
    isOptional(value.secretOrKeyProvider, (v) => typeof v === 'function')
  )
}

/**
 * Standard Schema that checks the shape of `JwtServiceOptions`. It is the
 * argument schema of `JwtServiceToken`, so options given to
 * `provideJwtService()` are checked when the service is resolved. It needs no
 * schema library; the options of individual sign and verify calls are checked
 * by `jsonwebtoken`.
 */
export const JwtServiceOptionsSchema: StandardSchemaV1<JwtServiceOptions, JwtServiceOptions> = {
  '~standard': {
    version: 1,
    vendor: 'navios',
    validate: (value) =>
      isJwtServiceOptions(value)
        ? { value }
        : {
            issues: [
              {
                message:
                  'JwtService options must be an object with optional `secret` (string), `publicKey` (string or Buffer), `privateKey` (string, Buffer or key object), `signOptions`, `verifyOptions` (objects) and `secretOrKeyProvider` (function)',
              },
            ],
          },
  },
}

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
