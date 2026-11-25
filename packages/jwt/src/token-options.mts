import type { KeyObject } from 'node:crypto'

/**
 * Supported JWT algorithms: HMAC, RSA, RSA-PSS and ECDSA.
 */
export type Algorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'

/**
 * JWT header type.
 *
 * Contains algorithm, type, and optional header claims.
 */
export interface JwtHeader {
  alg: Algorithm | (string & {})
  typ?: string | undefined
  cty?: string | undefined
  crit?: string[] | undefined
  kid?: string | undefined
  jku?: string | undefined
  x5u?: string | string[] | undefined
  'x5t#S256'?: string | undefined
  x5t?: string | undefined
  x5c?: string | string[] | undefined
}

/**
 * The payload of a token: the registered claims, and whatever else was signed.
 */
export interface JwtPayload {
  iss?: string
  sub?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  iat?: number
  jti?: string
  [claim: string]: unknown
}

/**
 * A token taken apart, as returned with `complete: true`.
 */
export interface JwtComplete<T = JwtPayload> {
  header: JwtHeader
  payload: T
  signature: string
}

/**
 * A key. Text is a PEM, or the secret itself where an HMAC secret is expected; bytes are the
 * same as text in a buffer. For another encoding (DER, JWK) create a `KeyObject` with
 * `createPublicKey()` or `createPrivateKey()` of `node:crypto`.
 */
export type JwtKey = string | Uint8Array | KeyObject

/**
 * A private key, optionally encrypted with a passphrase.
 */
export type JwtPrivateKey = JwtKey | { key: string | Uint8Array; passphrase: string }

/**
 * Default options for signing tokens: algorithm, expiration, audience, issuer and the other
 * standard JWT claims.
 *
 * A time span is a number of seconds or a string with a unit, such as `'15m'`.
 */
export interface SignOptions {
  /** By default the first algorithm of the key type: `HS256`, `RS256`, `PS256` or the ES algorithm of the curve */
  algorithm?: Algorithm | undefined
  keyid?: string | undefined
  expiresIn?: string | number | undefined
  notBefore?: string | number | undefined
  audience?: string | string[] | undefined
  subject?: string | undefined
  issuer?: string | undefined
  jwtid?: string | undefined
  mutatePayload?: boolean | undefined
  noTimestamp?: boolean | undefined
  header?: Partial<JwtHeader> | undefined
  encoding?: string | undefined
  allowInsecureKeySizes?: boolean | undefined
}

/**
 * Default options for verifying tokens: allowed algorithms, audience, issuer,
 * expiration handling and the other validation rules.
 */
export interface VerifyOptions {
  /** By default the algorithms of the key type */
  algorithms?: readonly Algorithm[] | undefined
  audience?: string | RegExp | (string | RegExp)[] | undefined
  clockTimestamp?: number | undefined
  clockTolerance?: number | undefined
  issuer?: string | string[] | undefined
  ignoreExpiration?: boolean | undefined
  ignoreNotBefore?: boolean | undefined
  jwtid?: string | undefined
  nonce?: string | undefined
  subject?: string | undefined
  maxAge?: string | number | undefined
}

/** The sign options that set a claim. */
export type ClaimOption = 'expiresIn' | 'notBefore' | 'audience' | 'issuer' | 'subject' | 'jwtid'

/** The sign options that can only be used together with an object payload. */
export type ObjectPayloadOption = ClaimOption | 'noTimestamp'

/**
 * Options of a single `sign()` or `signAsync()` call.
 *
 * They are merged over the `signOptions` of the service. An option that is `undefined` is not
 * given; `null` leaves out a claim the service would set by default.
 *
 * A `secret` or `privateKey` given here wins over everything configured on the
 * service, including `keys`. If both are given, `secret` is used.
 *
 * @property secret - Secret key for symmetric algorithms (overrides service default)
 * @property privateKey - Private key for asymmetric algorithms (overrides service default)
 */
export interface JwtSignOptions extends Omit<SignOptions, ClaimOption> {
  expiresIn?: string | number | null | undefined
  notBefore?: string | number | null | undefined
  audience?: string | string[] | null | undefined
  subject?: string | null | undefined
  issuer?: string | null | undefined
  jwtid?: string | null | undefined
  /** Secret key for symmetric algorithms */
  secret?: JwtKey
  /** Private key for asymmetric algorithms */
  privateKey?: JwtPrivateKey
}

/**
 * Options of a single `verify()` or `verifyAsync()` call.
 *
 * They are merged over the `verifyOptions` of the service. An option that is `undefined` is
 * not given: it does not switch off a check of the service.
 *
 * A `secret` or `publicKey` given here wins over everything configured on the
 * service, including `keys`. If both are given, `secret` is used.
 *
 * @property secret - Secret key for symmetric algorithms (overrides service default)
 * @property publicKey - Public key for asymmetric algorithms (overrides service default)
 */
export interface JwtVerifyOptions extends VerifyOptions {
  /** Return the header and the signature with the payload */
  complete?: false | undefined
  /** Secret key for symmetric algorithms */
  secret?: JwtKey
  /** Public key for asymmetric algorithms */
  publicKey?: JwtKey
}

/**
 * Options of `decode()`.
 */
export interface JwtDecodeOptions {
  /** Return the header and the signature with the payload */
  complete?: false | undefined
  /** Parse the payload as JSON whatever the `typ` of the header says */
  json?: boolean | undefined
}
