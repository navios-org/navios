import { z } from 'zod/v4'

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
 * Includes symmetric (HMAC) and asymmetric (RSA, ECDSA, EdDSA) algorithms.
 */
export const AlgorithmType = z.enum([
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'PS256',
  'PS384',
  'PS512',
  'none',
])

/**
 * JWT header schema.
 *
 * Defines the structure of the JWT header with standard claims.
 */
export const JwtHeaderSchema = z.object({
  alg: AlgorithmType.or(z.string()),
  typ: z.string().optional(),
  cty: z.string().optional(),
  crit: z.string().array().optional(),
  kid: z.string().optional(),
  jku: z.string().optional(),
  x5u: z.union([z.string(), z.array(z.string())]).optional(),
  'x5t#S256': z.string().optional(),
  x5t: z.string().optional(),
  x5c: z.union([z.string(), z.array(z.string())]).optional(),
})

/**
 * JWT header type.
 *
 * Contains algorithm, type, and optional header claims.
 */
export type JwtHeader = z.infer<typeof JwtHeaderSchema>

/**
 * Schema for JWT signing options.
 *
 * Defines all available options for signing tokens including algorithm,
 * expiration, audience, issuer, and other standard JWT claims.
 */
export const SignOptionsSchema = z.object({
  algorithm: AlgorithmType.optional(),
  keyid: z.string().optional(),
  expiresIn: z.union([z.string(), z.number()]).optional(),
  notBefore: z.union([z.string(), z.number()]).optional(),
  audience: z
    .union([z.string(), z.instanceof(RegExp), z.array(z.union([z.string(), z.instanceof(RegExp)]))])
    .optional(),
  subject: z.string().optional(),
  issuer: z.string().optional(),
  jwtid: z.string().optional(),
  mutatePayload: z.boolean().optional(),
  noTimestamp: z.boolean().optional(),
  header: JwtHeaderSchema.optional(),
  encoding: z.string().optional(),
  allowInsecureKeySizes: z.boolean().optional(),
  allowInvalidAsymmetricKeyTypes: z.boolean().optional(),
})

/**
 * Options for signing JWT tokens.
 *
 * @see SignOptionsSchema for the complete schema definition
 */
export type SignOptions = z.infer<typeof SignOptionsSchema>

/**
 * Schema for JWT verification options.
 *
 * Defines all available options for verifying tokens including allowed
 * algorithms, audience, issuer, expiration handling, and other validation rules.
 */
export const VerifyOptionsSchema = z.object({
  algorithms: AlgorithmType.array().optional(),
  audience: z
    .union([z.string(), z.instanceof(RegExp), z.array(z.union([z.string(), z.instanceof(RegExp)]))])
    .optional(),
  clockTimestamp: z.number().optional(),
  clockTolerance: z.number().optional(),
  complete: z.boolean().optional(),
  issuer: z.union([z.string(), z.string().array()]).optional(),
  ignoreExpiration: z.boolean().optional(),
  ignoreNotBefore: z.boolean().optional(),
  jwtid: z.string().optional(),
  nonce: z.string().optional(),
  subject: z.string().optional(),
  maxAge: z.union([z.string(), z.number()]).optional(),
  allowInvalidAsymmetricKeyTypes: z.boolean().optional(),
})

/**
 * Options for verifying JWT tokens.
 *
 * @see VerifyOptionsSchema for the complete schema definition
 */
export type VerifyOptions = z.infer<typeof VerifyOptionsSchema>

/**
 * Schema for JWT secret/key types.
 *
 * Supports string secrets, Buffer objects, and key objects with passphrases.
 */
export const SecretSchema = z.union([
  z.string(),
  z.instanceof(Buffer),
  z
    .object({
      type: z.string(),
    })
    .passthrough(),
  z.object({
    key: z.union([z.string(), z.instanceof(Buffer)]),
    passphrase: z.string(),
  }),
])

/**
 * Secret or key type for JWT operations.
 *
 * Can be a string, Buffer, or an object with key and optional passphrase.
 */
export type Secret = z.infer<typeof SecretSchema>

export const JwtServiceOptionsSchema = z.object({
  signOptions: SignOptionsSchema.optional(),
  secret: z.string().optional(),
  publicKey: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  privateKey: SecretSchema.optional(),
  verifyOptions: VerifyOptionsSchema.optional(),
  secretOrKeyProvider: z
    .function({
      input: [
        z.enum(RequestType),
        z.any(),
        z.union([SignOptionsSchema, VerifyOptionsSchema]).optional(),
      ],
      output: SecretSchema,
    })
    .optional(),
})

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
export type JwtServiceOptions = z.infer<typeof JwtServiceOptionsSchema>

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
