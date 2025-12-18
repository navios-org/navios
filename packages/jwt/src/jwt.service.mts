import { inject, Injectable, InjectionToken, Logger } from '@navios/core'

import jwt from 'jsonwebtoken'

import type {
  GetSecretKeyResult,
  JwtServiceOptions,
  JwtSignOptions,
  JwtVerifyOptions,
  SignOptions,
  VerifyOptions,
} from './options/jwt-service.options.mjs'

import {
  JwtServiceOptionsSchema,
  RequestType,
} from './options/jwt-service.options.mjs'

/**
 * Injection token for JwtService.
 *
 * Used internally by the dependency injection system to register and resolve JwtService instances.
 */
export const JwtServiceToken = InjectionToken.create(
  Symbol.for('JwtService'),
  JwtServiceOptionsSchema,
)

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
@Injectable({
  token: JwtServiceToken,
})
export class JwtService {
  logger = inject(Logger, {
    context: JwtService.name,
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
   * When the payload is a string, only `secret` and `privateKey` options are allowed.
   * For object or Buffer payloads, all sign options are available.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options. When payload is a string, only `secret` and `privateKey` are allowed.
   * @returns The signed JWT token as a string
   * @throws {Error} If `secretOrKeyProvider` returns a Promise (use `signAsync` instead)
   * @throws {Error} If payload is a string and invalid options are provided
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
  sign(
    payload: string,
    options?: Omit<JwtSignOptions, keyof SignOptions>,
  ): string
  /**
   * Signs a JWT payload synchronously.
   *
   * @param payload - The payload to sign. Can be a Buffer or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns The signed JWT token as a string
   */
  sign(payload: Buffer | object, options?: JwtSignOptions): string
  sign(
    payload: string | Buffer | object,
    options: JwtSignOptions = {},
  ): string {
    const signOptions = this.mergeJwtOptions(
      { ...options },
      'signOptions',
    ) as jwt.SignOptions
    const secret = this.getSecretKey(
      payload,
      options,
      'privateKey',
      RequestType.Sign,
    )

    if (secret instanceof Promise) {
      secret.catch(() => {}) // suppress rejection from async provider
      this.logger.warn(
        'For async version of "secretOrKeyProvider", please use "signAsync".',
      )
      throw new Error()
    }

    const allowedSignOptKeys = ['secret', 'privateKey']
    const signOptKeys = Object.keys(signOptions)
    if (
      typeof payload === 'string' &&
      signOptKeys.some((k) => !allowedSignOptKeys.includes(k))
    ) {
      throw new Error(
        'Payload as string is not allowed with the following sign options: ' +
          signOptKeys.join(', '),
      )
    }

    return jwt.sign(payload, secret, signOptions)
  }

  /**
   * Signs a JWT payload asynchronously.
   *
   * Use this method when `secretOrKeyProvider` returns a Promise or when you need
   * to handle async key resolution. Supports the same payload types and options as `sign()`.
   *
   * @param payload - The payload to sign. Can be a string, Buffer, or object.
   * @param options - Signing options. When payload is a string, only `secret` and `privateKey` are allowed.
   * @returns A Promise that resolves to the signed JWT token as a string
   * @throws {Error} If payload is a string and invalid options are provided
   *
   * @example
   * ```ts
   * // Sign with async key provider
   * const token = await jwtService.signAsync(
   *   { userId: '123' },
   *   { expiresIn: '1h' }
   * )
   * ```
   */
  signAsync(
    payload: string,
    options?: Omit<JwtSignOptions, keyof jwt.SignOptions>,
  ): Promise<string>
  /**
   * Signs a JWT payload asynchronously.
   *
   * @param payload - The payload to sign. Can be a Buffer or object.
   * @param options - Signing options including algorithm, expiration, etc.
   * @returns A Promise that resolves to the signed JWT token as a string
   */
  signAsync(payload: Buffer | object, options?: JwtSignOptions): Promise<string>
  signAsync(
    payload: string | Buffer | object,
    options: JwtSignOptions = {},
  ): Promise<string> {
    const signOptions = this.mergeJwtOptions(
      { ...options },
      'signOptions',
    ) as jwt.SignOptions
    const secret = this.getSecretKey(
      payload,
      options,
      'privateKey',
      RequestType.Sign,
    )

    const allowedSignOptKeys = ['secret', 'privateKey']
    const signOptKeys = Object.keys(signOptions)
    if (
      typeof payload === 'string' &&
      signOptKeys.some((k) => !allowedSignOptKeys.includes(k))
    ) {
      throw new Error(
        'Payload as string is not allowed with the following sign options: ' +
          signOptKeys.join(', '),
      )
    }

    return new Promise((resolve, reject) =>
      Promise.resolve()
        .then(() => secret)
        .then((scrt: GetSecretKeyResult) => {
          jwt.sign(payload, scrt, signOptions, (err, encoded) =>
            err ? reject(err) : resolve(encoded as string),
          )
        }),
    )
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
   * @throws {Error} If `secretOrKeyProvider` returns a Promise (use `verifyAsync` instead)
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
  verify<T extends object = any>(
    token: string,
    options: JwtVerifyOptions = {},
  ): T {
    const verifyOptions = this.mergeJwtOptions({ ...options }, 'verifyOptions')
    const secret = this.getSecretKey(
      token,
      options,
      'publicKey',
      RequestType.Verify,
    )

    if (secret instanceof Promise) {
      secret.catch(() => {}) // suppress rejection from async provider
      this.logger.warn(
        'For async version of "secretOrKeyProvider", please use "verifyAsync".',
      )
      throw new Error()
    }

    // @ts-expect-error We check it
    return jwt.verify(token, secret, verifyOptions) as unknown as T
  }

  /**
   * Verifies and decodes a JWT token asynchronously.
   *
   * Use this method when `secretOrKeyProvider` returns a Promise or when you need
   * to handle async key resolution. Provides the same validation as `verify()`.
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
  verifyAsync<T extends object = any>(
    token: string,
    options: JwtVerifyOptions = {},
  ): Promise<T> {
    const verifyOptions = this.mergeJwtOptions({ ...options }, 'verifyOptions')
    const secret = this.getSecretKey(
      token,
      options,
      'publicKey',
      RequestType.Verify,
    )

    return new Promise((resolve, reject) =>
      Promise.resolve()
        .then(() => secret)
        .then((scrt: GetSecretKeyResult) => {
          // @ts-expect-error We check it
          jwt.verify(token, scrt, verifyOptions, (err, decoded) =>
            err ? reject(err) : resolve(decoded as T),
          )
        })
        .catch(reject),
    )
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
  decode<T = any>(token: string, options?: jwt.DecodeOptions): T {
    return jwt.decode(token, options) as T
  }

  private mergeJwtOptions(
    options: JwtVerifyOptions | JwtSignOptions,
    key: 'verifyOptions' | 'signOptions',
  ): VerifyOptions | SignOptions {
    delete options.secret
    if (key === 'signOptions') {
      delete (options as JwtSignOptions).privateKey
    } else {
      delete (options as JwtVerifyOptions).publicKey
    }
    return options
      ? {
          ...this.options[key],
          ...options,
        }
      : // @ts-expect-error We check it
        this.options[key]
  }

  private getSecretKey(
    token: string | object | Buffer,
    options: JwtVerifyOptions | JwtSignOptions,
    key: 'publicKey' | 'privateKey',
    secretRequestType: RequestType,
  ): GetSecretKeyResult | Promise<GetSecretKeyResult> {
    const secret = this.options.secretOrKeyProvider
      ? this.options.secretOrKeyProvider(secretRequestType, token, options)
      : options?.secret ||
        this.options.secret ||
        (key === 'privateKey'
          ? (options as JwtSignOptions)?.privateKey || this.options.privateKey
          : (options as JwtVerifyOptions)?.publicKey ||
            this.options.publicKey) ||
        this.options[key]

    return secret as GetSecretKeyResult
  }
}
