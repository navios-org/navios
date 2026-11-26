import { JsonWebTokenError } from './errors.mjs'
import { decodeToken, parseHeader, signToken, verifyToken } from './internal/engine.mjs'
import {
  configurationError,
  isShortSecret,
  parsePrivateKey,
  parsePublicKey,
  parseSecret,
} from './internal/key.mjs'
import { askKeys, intersect } from './internal/keys-function.mjs'
import {
  checkSignOptions,
  checkVerifyOptions,
  CLAIMS,
  mergeOptions,
  OBJECT_PAYLOAD_OPTIONS,
  readDefaults,
} from './internal/options.mjs'

import type { Key } from './internal/key.mjs'
import type { KeysFunction, SelectedKey } from './internal/keys-function.mjs'
import type { JwtServiceOptions } from './jwt-service-options.mjs'
import type {
  ClaimOption,
  JwtComplete,
  JwtDecodeOptions,
  JwtPayload,
  JwtSignOptions,
  JwtVerifyOptions,
  ObjectPayloadOption,
  SignOptions,
  VerifyOptions,
} from './token-options.mjs'

// Once per process: a service is created per container, so per test and per tenant.
let warnedOfShortSecret = false

/**
 * Service for signing, verifying, and decoding JSON Web Tokens (JWTs).
 *
 * It supports the symmetric (HS256, HS384, HS512) and asymmetric (RS256, PS256, ES256, etc.)
 * algorithms. Keys are parsed once, when the service is created, as what they are configured
 * as; the algorithms a token may use follow from the key unless they are pinned.
 *
 * A token that cannot be trusted is a `JsonWebTokenError`. A wrong configuration is a plain
 * `Error`, so that it is not mistaken for a wrong token.
 *
 * @example
 * ```ts
 * import { provideJwtService } from '@navios/jwt'
 * import { inject } from '@navios/core'
 *
 * const Jwt = provideJwtService({
 *   secret: process.env.JWT_SECRET,
 *   signOptions: { expiresIn: '1h' },
 * })
 *
 * @Injectable()
 * class AuthService {
 *   private readonly jwt = inject(Jwt)
 *
 *   login(userId: string) {
 *     return this.jwt.sign({ sub: userId, role: 'user' })
 *   }
 * }
 * ```
 */
export class JwtService {
  // Private to the runtime as well: a service that is logged or serialised shows no key.
  readonly #secret: Key | undefined
  readonly #publicKey: Key | undefined
  readonly #privateKey: Key | undefined
  readonly #keys: KeysFunction | undefined
  readonly #signOptions: SignOptions
  readonly #verifyOptions: VerifyOptions

  /**
   * Creates a new JwtService instance.
   *
   * @param options - Configuration options for the JWT service
   * @throws {Error} If a key is empty or cannot be parsed, or an option has no or a wrong value
   */
  constructor(options: JwtServiceOptions) {
    if (typeof options !== 'object' || options === null) {
      throw configurationError('the configuration must be an object')
    }
    if (options.keys !== undefined && typeof options.keys !== 'function') {
      throw configurationError('`keys` must be a function')
    }
    this.#secret = 'secret' in options ? parseSecret(options.secret, '`secret`') : undefined
    this.#publicKey =
      'publicKey' in options ? parsePublicKey(options.publicKey, '`publicKey`') : undefined
    this.#privateKey =
      'privateKey' in options ? parsePrivateKey(options.privateKey, '`privateKey`') : undefined
    this.#keys = options.keys
    this.#signOptions = readDefaults(options.signOptions, '`signOptions`', checkSignOptions)
    this.#verifyOptions = readDefaults(options.verifyOptions, '`verifyOptions`', checkVerifyOptions)

    if (!warnedOfShortSecret && this.#secret !== undefined && isShortSecret(this.#secret)) {
      warnedOfShortSecret = true
      process.emitWarning(
        'The secret of a JwtService is shorter than 32 bytes. Use at least 32 random bytes: a short secret can be guessed from a single token',
        { code: 'NAVIOS_JWT_SHORT_SECRET' },
      )
    }
  }

  /**
   * Signs a JWT payload synchronously.
   *
   * A string payload is signed as is: the claim options (`expiresIn`, `notBefore`,
   * `noTimestamp`, `audience`, `issuer`, `subject`, `jwtid`) cannot be passed with it, and
   * the `signOptions` defaults of the service for them are not applied. `verify()` accepts
   * only object payloads, so such a token can only be decoded.
   * For object payloads, all sign options are available. A default claim is not applied when
   * the payload already has it, or when the option is `null`.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns The signed JWT token as a string
   * @throws {Error} If payload is a string and invalid options are provided
   * @throws {Error} If `keys` returns a promise; use `signAsync()`
   *
   * @example
   * ```ts
   * // Sign with object payload
   * const token = jwtService.sign(
   *   { userId: '123', role: 'admin' },
   *   { expiresIn: '1h' }
   * )
   *
   * // Sign with string payload (limited options)
   * const token = jwtService.sign('payload-string', { secret: 'key' })
   * ```
   */
  sign(payload: string, options?: Omit<JwtSignOptions, ObjectPayloadOption>): string
  /**
   * Signs a JWT payload synchronously.
   *
   * @param payload - The payload to sign. Can be a Buffer or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns The signed JWT token as a string
   */
  sign(payload: Buffer | object, options?: JwtSignOptions): string
  sign(payload: string | Buffer | object, options: JwtSignOptions = {}): string {
    const signOptions = this.#prepareSign(payload, options)
    const key = requireSync(this.#selectSignKey(payload, options, signOptions), 'sign')
    return signWith(payload, key, options, signOptions)
  }

  /**
   * Signs a JWT payload asynchronously.
   *
   * Supports the same payload types and options as `sign()`, and awaits a
   * `keys` function that returns a promise.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns A Promise that resolves to the signed JWT token as a string
   * @throws {Error} If payload is a string and invalid options are provided
   *
   * @example
   * ```ts
   * const token = await jwtService.signAsync(
   *   { userId: '123' },
   *   { expiresIn: '1h' }
   * )
   * ```
   */
  signAsync(payload: string, options?: Omit<JwtSignOptions, ObjectPayloadOption>): Promise<string>
  /**
   * Signs a JWT payload asynchronously.
   *
   * @param payload - The payload to sign. Can be a Buffer or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns A Promise that resolves to the signed JWT token as a string
   */
  signAsync(payload: Buffer | object, options?: JwtSignOptions): Promise<string>
  async signAsync(
    payload: string | Buffer | object,
    options: JwtSignOptions = {},
  ): Promise<string> {
    const signOptions = this.#prepareSign(payload, options)
    const key = await this.#selectSignKey(payload, options, signOptions)
    return signWith(payload, key, options, signOptions)
  }

  /**
   * Verifies a JWT token synchronously and returns its header, payload and signature.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns The token taken apart
   */
  verify<T extends object = JwtPayload>(
    token: string,
    options: Omit<JwtVerifyOptions, 'complete'> & { complete: true },
  ): JwtComplete<T>
  /**
   * Verifies and decodes a JWT token synchronously.
   *
   * This method validates the token's signature, expiration, and other claims
   * according to the provided options. If verification fails, an error is thrown.
   * The shape of the payload is not checked: `T` is a cast.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns The decoded payload as type T
   * @throws {TokenExpiredError} If the token has expired
   * @throws {NotBeforeError} If the token is not yet valid (nbf claim)
   * @throws {JsonWebTokenError} If the token is invalid or malformed
   * @throws {Error} If there is no key, or the options are wrong
   * @throws {Error} If `keys` returns a promise; use `verifyAsync()`
   *
   * @example
   * ```ts
   * try {
   *   const payload = jwtService.verify<{ userId: string; role: string }>(token)
   *   console.log(payload.userId) // '123'
   * } catch (error) {
   *   if (error instanceof TokenExpiredError) {
   *     console.error('Token expired')
   *   }
   * }
   * ```
   */
  verify<T extends object = JwtPayload>(token: string, options?: JwtVerifyOptions): T
  verify(
    token: string,
    options: Omit<JwtVerifyOptions, 'complete'> & { complete?: boolean | undefined } = {},
  ): object {
    const verifyOptions = this.#prepareVerify(options)
    const key = requireSync(this.#selectVerifyKey(token, options, verifyOptions), 'verify')
    return verifyWith(token, key, options, verifyOptions)
  }

  /**
   * Verifies a JWT token asynchronously and returns its header, payload and signature.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns A Promise that resolves to the token taken apart
   */
  verifyAsync<T extends object = JwtPayload>(
    token: string,
    options: Omit<JwtVerifyOptions, 'complete'> & { complete: true },
  ): Promise<JwtComplete<T>>
  /**
   * Verifies and decodes a JWT token asynchronously.
   *
   * Provides the same validation as `verify()`, and awaits a `keys` function
   * that returns a promise (for example a JWKS lookup).
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns A Promise that resolves to the decoded payload as type T
   * @throws {TokenExpiredError} If the token has expired
   * @throws {NotBeforeError} If the token is not yet valid (nbf claim)
   * @throws {JsonWebTokenError} If the token is invalid or malformed
   * @throws {Error} If there is no key, or the options are wrong
   *
   * @example
   * ```ts
   * try {
   *   const payload = await jwtService.verifyAsync<{ userId: string }>(token)
   *   console.log(payload.userId)
   * } catch (error) {
   *   if (error instanceof TokenExpiredError) {
   *     console.error('Token expired')
   *   }
   * }
   * ```
   */
  verifyAsync<T extends object = JwtPayload>(token: string, options?: JwtVerifyOptions): Promise<T>
  async verifyAsync(
    token: string,
    options: Omit<JwtVerifyOptions, 'complete'> & { complete?: boolean | undefined } = {},
  ): Promise<object> {
    const verifyOptions = this.#prepareVerify(options)
    const key = await this.#selectVerifyKey(token, options, verifyOptions)
    return verifyWith(token, key, options, verifyOptions)
  }

  /**
   * Decodes a JWT token without verification and returns its header, payload and signature.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to decode
   * @param options - Decode options
   * @returns The token taken apart, or null if decoding fails
   */
  decode<T = JwtPayload>(
    token: string,
    options: Omit<JwtDecodeOptions, 'complete'> & { complete: true },
  ): JwtComplete<T> | null
  /**
   * Decodes a JWT token without verification.
   *
   * This method decodes the token without validating its signature or claims.
   * Use this only when you need to inspect the token contents without verification.
   * For secure token validation, use `verify()` or `verifyAsync()` instead.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to decode
   * @param options - Decode options
   * @returns The decoded payload as type T, or null if decoding fails
   *
   * @example
   * ```ts
   * // Decode without verification (not recommended for production)
   * const payload = jwtService.decode<{ userId: string }>(token)
   * if (payload) {
   *   console.log(payload.userId)
   * }
   * ```
   */
  decode<T = JwtPayload>(token: string, options?: JwtDecodeOptions): T | null
  decode(
    token: string,
    options?: Omit<JwtDecodeOptions, 'complete'> & { complete?: boolean | undefined },
  ): unknown {
    return decodeToken(token, options)
  }

  #prepareSign(payload: string | Buffer | object, options: JwtSignOptions): SignOptions {
    checkSignOptions(options, 'the options of sign()')
    const signOptions = mergeOptions(this.#signOptions, options)

    if (typeof payload !== 'object' || Buffer.isBuffer(payload)) {
      // `jsonwebtoken` refuses these options unless the payload is an object.
      const forbidden =
        typeof payload === 'string'
          ? OBJECT_PAYLOAD_OPTIONS.filter((name) => (options[name] ?? null) !== null)
          : []
      if (forbidden.length > 0) {
        throw new Error(
          'Payload as string is not allowed with the following sign options: ' +
            forbidden.join(', '),
        )
      }
      // So the defaults of the service are not applied to such a payload either.
      for (const name of OBJECT_PAYLOAD_OPTIONS) {
        if ((options[name] ?? null) === null) {
          delete signOptions[name]
        }
      }
      return signOptions
    }

    for (const name in CLAIMS) {
      const option = name as ClaimOption
      const isDefault = options[option] === undefined
      if (
        options[option] === null ||
        (isDefault && (payload as JwtPayload | null)?.[CLAIMS[option]] !== undefined)
      ) {
        delete signOptions[option]
      }
    }
    return signOptions
  }

  #prepareVerify(options: object): VerifyOptions {
    checkVerifyOptions(options, 'the options of verify()')
    return mergeOptions(this.#verifyOptions, options)
  }

  /**
   * Picks the key of one call. What the caller passes wins over what the service was
   * configured with: per-call `secret`, per-call key, then `keys`, the `secret` of the
   * service and its key. A key that is passed but empty is an error: falling back to the key
   * of the service would accept the tokens of the service where another key was meant.
   */
  #selectSignKey(
    payload: string | Buffer | object,
    options: JwtSignOptions,
    signOptions: SignOptions,
  ): SelectedKey | Promise<SelectedKey> {
    if ('secret' in options) {
      return { key: parseSecret(options.secret, '`secret` in the options of sign()') }
    }
    if ('privateKey' in options) {
      return { key: parsePrivateKey(options.privateKey, '`privateKey` in the options of sign()') }
    }
    if (this.#keys !== undefined) {
      const { algorithm } = signOptions
      return askKeys(this.#keys, { use: 'sign', payload }, algorithm && [algorithm])
    }
    const key = this.#secret ?? this.#privateKey
    if (key === undefined) {
      throw configurationError(
        'there is no key to sign with. Configure `secret`, `privateKey` or `keys`, or pass a key to the call',
      )
    }
    return { key }
  }

  #selectVerifyKey(
    token: string,
    options: Omit<JwtVerifyOptions, 'complete'>,
    { algorithms }: VerifyOptions,
  ): SelectedKey | Promise<SelectedKey> {
    if ('secret' in options) {
      return { key: parseSecret(options.secret, '`secret` in the options of verify()') }
    }
    if ('publicKey' in options) {
      return { key: parsePublicKey(options.publicKey, '`publicKey` in the options of verify()') }
    }
    if (this.#keys !== undefined) {
      const header = parseHeader(token, algorithms)
      return askKeys(this.#keys, { use: 'verify', header }, algorithms)
    }
    const key = this.#secret ?? this.#publicKey
    if (key === undefined) {
      throw configurationError(
        'there is no key to verify with. Configure `secret`, `publicKey` or `keys`, or pass a key to the call',
      )
    }
    return { key }
  }
}

function signWith(
  payload: string | Buffer | object,
  selected: SelectedKey,
  options: JwtSignOptions,
  signOptions: SignOptions,
): string {
  const { key, keyid, algorithms = key.algorithms } = selected
  const algorithm = signOptions.algorithm ?? algorithms[0]!
  if (!algorithms.includes(algorithm) || !key.algorithms.includes(algorithm)) {
    throw configurationError(`${key.label} cannot be used to sign with ${algorithm}`)
  }
  if (keyid !== undefined && options.keyid === undefined) {
    signOptions.keyid = keyid
  }
  return signToken(payload, key, algorithm, signOptions)
}

function verifyWith(
  token: string,
  { key, algorithms, fromKeys }: SelectedKey,
  { complete }: { complete?: boolean | undefined },
  verifyOptions: VerifyOptions,
): object {
  const pinned = verifyOptions.algorithms
  const allowed = intersect(intersect(key.algorithms, pinned), algorithms)
  if (allowed.length === 0) {
    if (fromKeys) {
      // The sender of the token chose a key that is not meant for these algorithms.
      throw new JsonWebTokenError('invalid algorithm')
    }
    throw configurationError(`${key.label} cannot be used to verify ${pinned!.join(', ')}`)
  }
  const verified = verifyToken(token, key, allowed, verifyOptions)
  return complete === true ? verified : verified.payload
}

function requireSync(
  key: SelectedKey | Promise<SelectedKey>,
  method: 'sign' | 'verify',
): SelectedKey {
  // askKeys answers a promise of its own making when `keys` answers one.
  if (key instanceof Promise) {
    // The promise is dropped; do not let its rejection go unhandled.
    key.then(undefined, () => {})
    throw configurationError(
      `${method}() cannot be used with a \`keys\` function that returns a promise. Use ${method}Async() instead`,
    )
  }
  return key
}
