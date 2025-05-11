import { Injectable, Logger, syncInject } from '@navios/core'

import jwt from 'jsonwebtoken'

import type {
  GetSecretKeyResult,
  JwtServiceOptions,
  JwtSignOptions,
  JwtVerifyOptions,
  SignOptions,
  VerifyOptions,
} from './options/jwt-service.options.mjs'

import { RequestType } from './options/jwt-service.options.mjs'

@Injectable()
export class JwtService {
  logger = syncInject(Logger, {
    context: JwtService.name,
  })

  constructor(private readonly options: JwtServiceOptions = {}) {}

  sign(
    payload: string,
    options?: Omit<JwtSignOptions, keyof SignOptions>,
  ): string
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

  signAsync(
    payload: string,
    options?: Omit<JwtSignOptions, keyof jwt.SignOptions>,
  ): Promise<string>
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

    return jwt.verify(token, secret, verifyOptions) as unknown as T
  }

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
          jwt.verify(token, scrt, verifyOptions, (err, decoded) =>
            err ? reject(err) : resolve(decoded as T),
          )
        })
        .catch(reject),
    )
  }

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
          ...(this.options[key] || {}),
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
