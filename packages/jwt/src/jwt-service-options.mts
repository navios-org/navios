import type { StandardSchemaV1 } from '@navios/core'

import type { Secret, SignOptions, VerifyOptions } from './token-options.mjs'

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
