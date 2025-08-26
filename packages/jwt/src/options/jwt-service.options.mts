import type { Secret as JwtSecret } from 'jsonwebtoken'

import { z } from 'zod'

export enum RequestType {
  Sign = 'Sign',
  Verify = 'Verify',
}

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

export type JwtHeader = z.infer<typeof JwtHeaderSchema>

export const SignOptionsSchema = z.object({
  algorithm: AlgorithmType.optional(),
  keyid: z.string().optional(),
  expiresIn: z.union([z.string(), z.number()]).optional(),
  notBefore: z.union([z.string(), z.number()]).optional(),
  audience: z
    .union([
      z.string(),
      z.instanceof(RegExp),
      z.array(z.union([z.string(), z.instanceof(RegExp)])),
    ])
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

export type SignOptions = z.infer<typeof SignOptionsSchema>

export const VerifyOptionsSchema = z.object({
  algorithms: AlgorithmType.array().optional(),
  audience: z
    .union([
      z.string(),
      z.instanceof(RegExp),
      z.array(z.union([z.string(), z.instanceof(RegExp)])),
    ])
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

export type VerifyOptions = z.infer<typeof VerifyOptionsSchema>

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

export type Secret = z.infer<typeof SecretSchema>

export const JwtServiceOptionsSchema = z.object({
  signOptions: SignOptionsSchema.optional(),
  secret: z.string().optional(),
  publicKey: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  privateKey: SecretSchema.optional(),
  verifyOptions: VerifyOptionsSchema.optional(),
  secretOrKeyProvider: z
    .function()
    .args(
      z.nativeEnum(RequestType),
      z.any(),
      z.union([SignOptionsSchema, VerifyOptionsSchema]).optional(),
    )
    .returns(z.union([SecretSchema, z.promise(SecretSchema)]))
    .optional(),
})

export type JwtServiceOptions = z.infer<typeof JwtServiceOptionsSchema>

export interface JwtSignOptions extends SignOptions {
  secret?: string | Buffer
  privateKey?: Secret
}

export interface JwtVerifyOptions extends VerifyOptions {
  secret?: string | Buffer
  publicKey?: string | Buffer
}

export type GetSecretKeyResult = string | Buffer | JwtSecret
