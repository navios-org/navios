import { inject, InjectionToken, Logger, registerInjectable } from '@navios/core'
import jwt from 'jsonwebtoken'

import { JwtServiceOptionsSchema, RequestType } from './jwt-service-options.mjs'

import type { JwtServiceOptions } from './jwt-service-options.mjs'
import type {
  GetSecretKeyResult,
  JwtSignOptions,
  JwtVerifyOptions,
  SignOptions,
  VerifyOptions,
} from './token-options.mjs'

/**
 * Service for signing, verifying, and decoding JSON Web Tokens (JWTs).
 *
 * This service provides a type-safe wrapper around the `jsonwebtoken` library with
 * seamless integration into Navios's dependency injection system. It supports both
 * symmetric (HS256, HS384, HS512) and asymmetric (RS256, ES256, etc.) algorithms.
 *
 * @example
 * ```ts
 * import { provideJwtService } from '@navios/jwt'
 * import { inject } from '@navios/core'
 *
 * const JwtService = provideJwtService({
 *   secret: 'your-secret-key',
 *   signOptions: { expiresIn: '1h' },
 * })
 *
 * @Injectable()
 * class AuthService {
 *   jwtService = inject(JwtService)
 *
 *   async login(userId: string) {
 *     const token = this.jwtService.sign({ userId, role: 'user' })
 *     return token
 *   }
 * }
 * ```
 */
/** Sign options `jsonwebtoken` accepts only together with an object payload. */
const OBJECT_PAYLOAD_SIGN_OPTIONS = [
  'expiresIn',
  'notBefore',
  'noTimestamp',
  'audience',
  'issuer',
  'subject',
  'jwtid',
] as const

export class JwtService {
  logger = inject(Logger, {
    context: 'JwtService',
  })

  /**
   * Creates a new JwtService instance.
   *
   * @param options - Configuration options for the JWT service
   */
  constructor(private readonly options: JwtServiceOptions = {}) {}

  /**
   * Signs a JWT payload synchronously.
   *
   * A string payload is signed as is: the claim options (`expiresIn`, `notBefore`,
   * `noTimestamp`, `audience`, `issuer`, `subject`, `jwtid`) cannot be passed with it, and
   * the `signOptions` defaults of the service for them are not applied.
   * For object payloads, all sign options are available.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options. When payload is a string, only `secret` and `privateKey` are allowed.
   * @returns The signed JWT token as a string
   * @throws {Error} If payload is a string and invalid options are provided
   * @throws {Error} If `secretOrKeyProvider` returns a promise; use `signAsync()`
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
  sign(payload: string, options?: Omit<JwtSignOptions, keyof SignOptions>): string
  /**
   * Signs a JWT payload synchronously.
   *
   * @param payload - The payload to sign. Can be a Buffer or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns The signed JWT token as a string
   */
  sign(payload: Buffer | object, options?: JwtSignOptions): string
  sign(payload: string | Buffer | object, options: JwtSignOptions = {}): string {
    const signOptions = this.prepareSign(payload, options)
    const secret = this.requireSyncKey(
      this.getSecretKey(payload, options, 'privateKey', RequestType.Sign),
      'sign',
    )
    return jwt.sign(payload, secret, signOptions)
  }

  /**
   * Signs a JWT payload asynchronously.
   *
   * Supports the same payload types and options as `sign()`, and awaits a
   * `secretOrKeyProvider` that returns a promise.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options. When payload is a string, only `secret` and `privateKey` are allowed.
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
  signAsync(payload: string, options?: Omit<JwtSignOptions, keyof jwt.SignOptions>): Promise<string>
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
    const signOptions = this.prepareSign(payload, options)
    const secret = await this.getSecretKey(payload, options, 'privateKey', RequestType.Sign)
    return new Promise((resolve, reject) => {
      jwt.sign(payload, secret, signOptions, (err, encoded) =>
        err ? reject(err) : resolve(encoded as string),
      )
    })
  }

  /**
   * Verifies and decodes a JWT token synchronously.
   *
   * This method validates the token's signature, expiration, and other claims
   * according to the provided options. If verification fails, an error is thrown.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns The decoded payload as type T
   * @throws {TokenExpiredError} If the token has expired
   * @throws {NotBeforeError} If the token is not yet valid (nbf claim)
   * @throws {JsonWebTokenError} If the token is invalid or malformed
   * @throws {Error} If `secretOrKeyProvider` returns a promise; use `verifyAsync()`
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
  verify<T extends object = any>(token: string, options: JwtVerifyOptions = {}): T {
    const verifyOptions = this.mergeJwtOptions({ ...options }, 'verifyOptions')
    const secret = this.requireSyncKey(
      this.getSecretKey(token, options, 'publicKey', RequestType.Verify),
      'verify',
    )
    // @ts-expect-error We check it
    return jwt.verify(token, secret, verifyOptions) as unknown as T
  }

  /**
   * Verifies and decodes a JWT token asynchronously.
   *
   * Provides the same validation as `verify()`, and awaits a `secretOrKeyProvider`
   * that returns a promise (for example a JWKS lookup).
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to verify
   * @param options - Verification options including algorithms, audience, issuer, etc.
   * @returns A Promise that resolves to the decoded payload as type T
   * @throws {TokenExpiredError} If the token has expired
   * @throws {NotBeforeError} If the token is not yet valid (nbf claim)
   * @throws {JsonWebTokenError} If the token is invalid or malformed
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
  async verifyAsync<T extends object = any>(
    token: string,
    options: JwtVerifyOptions = {},
  ): Promise<T> {
    const verifyOptions = this.mergeJwtOptions({ ...options }, 'verifyOptions')
    const secret = await this.getSecretKey(token, options, 'publicKey', RequestType.Verify)
    return new Promise((resolve, reject) => {
      // @ts-expect-error We check it
      jwt.verify(token, secret, verifyOptions, (err, decoded) =>
        err ? reject(err) : resolve(decoded as T),
      )
    })
  }

  /**
   * Decodes a JWT token without verification.
   *
   * This method decodes the token without validating its signature or claims.
   * Use this only when you need to inspect the token contents without verification.
   * For secure token validation, use `verify()` or `verifyAsync()` instead.
   *
   * @template T - The expected type of the decoded payload
   * @param token - The JWT token string to decode
   * @param options - Decode options (complete, json, etc.)
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
  decode<T = any>(token: string, options?: jwt.DecodeOptions): T | null {
    return jwt.decode(token, options) as T | null
  }

  private prepareSign(payload: string | Buffer | object, options: JwtSignOptions): jwt.SignOptions {
    if (typeof payload === 'object' && !Buffer.isBuffer(payload)) {
      return this.mergeJwtOptions({ ...options }, 'signOptions') as jwt.SignOptions
    }

    // `jsonwebtoken` refuses these options unless the payload is an object.
    if (typeof payload === 'string') {
      const forbidden = OBJECT_PAYLOAD_SIGN_OPTIONS.filter((k) => options[k] !== undefined)
      if (forbidden.length > 0) {
        throw new Error(
          'Payload as string is not allowed with the following sign options: ' +
            forbidden.join(', '),
        )
      }
    }
    // So the defaults of the service are not applied to such a payload either.
    const defaults = { ...this.options.signOptions }
    for (const key of OBJECT_PAYLOAD_SIGN_OPTIONS) {
      delete defaults[key]
    }
    return this.mergeJwtOptions({ ...options }, 'signOptions', defaults) as jwt.SignOptions
  }

  private mergeJwtOptions(
    options: JwtVerifyOptions | JwtSignOptions,
    key: 'verifyOptions' | 'signOptions',
    defaults: VerifyOptions | SignOptions | undefined = this.options[key],
  ): VerifyOptions | SignOptions {
    delete options.secret
    if (key === 'signOptions') {
      delete (options as JwtSignOptions).privateKey
    } else {
      delete (options as JwtVerifyOptions).publicKey
    }
    return {
      ...defaults,
      ...options,
    }
  }

  /**
   * Picks the secret or key of one call. What the caller passes wins over what
   * the service was configured with: per-call `secret`, per-call key, then
   * `secretOrKeyProvider`, the `secret` of the service and its key.
   */
  private getSecretKey(
    token: string | object | Buffer,
    options: JwtVerifyOptions | JwtSignOptions,
    key: 'publicKey' | 'privateKey',
    secretRequestType: RequestType,
  ): GetSecretKeyResult | Promise<GetSecretKeyResult> {
    const perCall =
      options.secret ||
      (key === 'privateKey'
        ? (options as JwtSignOptions).privateKey
        : (options as JwtVerifyOptions).publicKey)
    if (perCall) {
      return perCall as GetSecretKeyResult
    }
    if (this.options.secretOrKeyProvider) {
      return this.options.secretOrKeyProvider(secretRequestType, token, options) as
        | GetSecretKeyResult
        | Promise<GetSecretKeyResult>
    }
    return (this.options.secret || this.options[key]) as GetSecretKeyResult
  }

  private requireSyncKey(
    secret: GetSecretKeyResult | Promise<GetSecretKeyResult>,
    method: 'sign' | 'verify',
  ): GetSecretKeyResult {
    if (typeof (secret as PromiseLike<unknown> | undefined)?.then === 'function') {
      // The promise is dropped; do not let its rejection go unhandled.
      ;(secret as Promise<GetSecretKeyResult>).then(undefined, () => {})
      throw new Error(
        `JwtService.${method}() cannot be used with a secretOrKeyProvider that returns a promise. Use ${method}Async() instead.`,
      )
    }
    return secret as GetSecretKeyResult
  }
}

/**
 * Injection token for JwtService.
 *
 * Its argument is the service configuration (`JwtServiceOptions`). Use
 * `provideJwtService()` to get a token with the configuration attached.
 */
export const JwtServiceToken = InjectionToken.create<JwtService, typeof JwtServiceOptionsSchema>(
  'JwtService',
  JwtServiceOptionsSchema,
)

registerInjectable(JwtService, { token: JwtServiceToken })
