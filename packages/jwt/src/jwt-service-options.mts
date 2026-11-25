import type {
  Algorithm,
  JwtHeader,
  JwtKey,
  JwtPrivateKey,
  SignOptions,
  VerifyOptions,
} from './token-options.mjs'

/**
 * What `keys` is asked for: the key to verify a token with this header, or the key to sign
 * this payload with. The header is parsed but not verified; it is whatever the sender of the
 * token put there.
 */
export type JwtKeyRequest =
  | { use: 'verify'; header: JwtHeader }
  | { use: 'sign'; payload: string | Buffer | object }

/**
 * A key returned by `keys`.
 *
 * A `KeyObject` is parsed once and says itself which algorithms it can be used with. Text and
 * bytes do not, so they need `algorithms` here, or an `algorithms` or `algorithm` option.
 *
 * @property key - The key. `undefined` means that there is no such key
 * @property keyid - The `kid` header of tokens signed with the key
 * @property algorithms - The algorithms to verify with; the first one signs
 */
export type JwtKeyMaterial =
  | JwtKey
  | {
      key: JwtKey | undefined
      keyid?: string | undefined
      algorithms?: readonly Algorithm[] | undefined
    }

/**
 * Configuration options for the JWT service.
 *
 * A key or an option that is present must have a value: `secret: process.env.JWT_SECRET` fails
 * when the variable is not set. Leave the property out to configure none.
 *
 * @property signOptions - Default options for signing tokens
 * @property secret - Default secret for symmetric algorithms (HS256, HS384, HS512)
 * @property publicKey - Default public key for asymmetric algorithms (RS256, ES256, etc.)
 * @property privateKey - Default private key for asymmetric algorithms
 * @property verifyOptions - Default options for verifying tokens
 * @property keys - Optional function to choose the key of each call, for example by the `kid`
 *   header of the token or by a claim of the payload. `undefined` means that there is no such
 *   key. What is no key at all, which a hostile `kid` such as `constructor` finds in a plain
 *   object, rejects the token as well. It may return a promise (for example a JWKS lookup); then only `signAsync()` and
 *   `verifyAsync()` can be used. It wins over `secret` and the keys configured here, but
 *   not over a `secret`, `privateKey` or `publicKey` passed to an individual call.
 *
 * @example
 * ```ts
 * const options: JwtServiceOptions = {
 *   secret: process.env.JWT_SECRET,
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
  signOptions?: SignOptions | undefined
  secret?: JwtKey | undefined
  publicKey?: JwtKey | undefined
  privateKey?: JwtPrivateKey | undefined
  verifyOptions?: VerifyOptions | undefined
  keys?:
    | ((request: JwtKeyRequest) => JwtKeyMaterial | undefined | Promise<JwtKeyMaterial | undefined>)
    | undefined
}
