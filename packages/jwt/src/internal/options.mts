import type {
  ClaimOption,
  JwtPayload,
  ObjectPayloadOption,
  SignOptions,
  VerifyOptions,
} from '../token-options.mjs'

import { configurationError, isAlgorithm } from './key.mjs'

/** The claim each sign option sets. */
export const CLAIMS: Record<ClaimOption, keyof JwtPayload> = {
  expiresIn: 'exp',
  notBefore: 'nbf',
  audience: 'aud',
  issuer: 'iss',
  subject: 'sub',
  jwtid: 'jti',
}

export const OBJECT_PAYLOAD_OPTIONS: readonly ObjectPayloadOption[] = [
  ...(Object.keys(CLAIMS) as ClaimOption[]),
  'noTimestamp',
]

type Check = readonly [test: (value: any) => boolean, expected: string]

const isText = (value: unknown) => typeof value === 'string' && value !== ''
const isList = (value: unknown, test: (value: unknown) => boolean) =>
  Array.isArray(value) && value.length > 0 && value.every(test)

// The unit is required: `ms` reads '900' as milliseconds, so a lifetime from an environment
// variable would have passed when the token is issued.
const TIME_SPAN =
  /^-?\d*\.?\d+ *(?:milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)$/i

const isTimeSpan = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && TIME_SPAN.test(value))

const TEXT: Check = [isText, 'a non-empty string']
const FINITE: Check = [Number.isFinite, 'a finite number']
const BOOLEAN: Check = [(value) => typeof value === 'boolean', 'a boolean']
const SPAN: Check = [isTimeSpan, "a number of seconds or a string with a unit, such as '15m'"]

// `jsonwebtoken` skips a check whose option is empty, and reports other wrong options as an
// invalid token, so they are checked here.
const VERIFY_CHECKS: [keyof VerifyOptions, Check][] = [
  ['algorithms', [(v) => isList(v, isAlgorithm), 'a non-empty array of supported algorithms']],
  [
    'audience',
    [
      (value) => {
        const matches = (v: unknown) => isText(v) || v instanceof RegExp
        return matches(value) || isList(value, matches)
      },
      'a non-empty string, a RegExp or a non-empty array of them',
    ],
  ],
  ['issuer', [(v) => isText(v) || isList(v, isText), 'a non-empty string or array of strings']],
  ['subject', TEXT],
  ['jwtid', TEXT],
  ['nonce', TEXT],
  ['maxAge', [(v) => isTimeSpan(v) && v !== 0, SPAN[1]]],
  ['clockTolerance', FINITE],
  ['clockTimestamp', FINITE],
  ['ignoreExpiration', BOOLEAN],
  ['ignoreNotBefore', BOOLEAN],
]

const SIGN_CHECKS: [keyof SignOptions, Check][] = [
  ['algorithm', [isAlgorithm, 'a supported algorithm']],
  ['expiresIn', SPAN],
  ['notBefore', SPAN],
  [
    'header',
    [
      (v) => typeof v === 'object' && v !== null && (v.alg === undefined || isAlgorithm(v.alg)),
      'an object, and its alg a supported algorithm',
    ],
  ],
]

type Options = Record<string, unknown>

/** Checks the options of one call. */
export function checkVerifyOptions(options: object, where: string): void {
  check(options as Options, VERIFY_CHECKS, where)
}

/** Checks the options of one call. `null` is left to `mergeOptions()` and `jsonwebtoken`. */
export function checkSignOptions(options: object, where: string): void {
  check(options as Options, SIGN_CHECKS, where, true)
}

function check(options: Options, checks: [string, Check][], where: string, allowNull = false) {
  for (const [name, [test, expected]] of checks) {
    const value = options[name]
    if (value !== undefined && !(allowNull && value === null) && !test(value)) {
      throw configurationError(`\`${name}\` in ${where} must be ${expected}`)
    }
  }
}

/**
 * The `signOptions` or `verifyOptions` of a configuration, copied. An option without a value
 * would be a missing check or a missing claim, so it is refused.
 */
export function readDefaults<T extends object>(
  options: T | undefined,
  where: string,
  checkOptions: (options: object, where: string) => void,
): T {
  if (options === undefined) {
    return {} as T
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw configurationError(`${where} must be an object`)
  }
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === null) {
      throw configurationError(
        `\`${name}\` in ${where} has no value. Is an environment variable missing?`,
      )
    }
  }
  checkOptions(options, where)
  return { ...options }
}

const NOT_FOR_THE_ENGINE = new Set(['secret', 'publicKey', 'privateKey', 'complete'])

/**
 * Merges the options of a call over the defaults of the service. `undefined` is "not given":
 * it must not switch off what the service is configured with.
 */
export function mergeOptions<T extends object>(defaults: T, options: object): T {
  const merged = { ...defaults } as Options
  for (const name of Object.keys(options)) {
    const value = (options as Options)[name]
    if (value !== undefined && !NOT_FOR_THE_ENGINE.has(name)) {
      merged[name] = value
    }
  }
  return merged as T
}
