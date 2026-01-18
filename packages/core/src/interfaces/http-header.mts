import type { OutgoingHttpHeaders } from 'http'

export type OmitIndexSignature<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]
}

/**
 * HTTP header strings
 * Use this type only for input values, not for output values.
 */

export type HttpHeader =
  | keyof OmitIndexSignature<OutgoingHttpHeaders>
  | (string & Record<never, never>)
