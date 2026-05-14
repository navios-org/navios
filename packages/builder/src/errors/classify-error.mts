import { ZodError, type ZodType } from 'zod/v4'

import type { AbstractResponse } from '../types/common.mjs'
import type { EnvelopeError } from '../types/envelope-error.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

function getResponse(error: unknown): AbstractResponse<unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('response' in error) || !error.response) return null
  return error.response as AbstractResponse<unknown>
}

/**
 * Classify an unknown error into an EnvelopeError variant.
 *
 * - HTTP error with response.status in errorSchema -> 'http'
 * - HTTP error whose matched schema fails Zod parse -> 'validation'
 * - HTTP error with response but no matching schema -> 'http-unknown'
 * - No response at all -> 'network'
 *
 * @param error The thrown value (usually a NaviosError)
 * @param errorSchema Optional per-status schemas; when omitted, all HTTP errors fall through to 'http-unknown'
 */
export function classifyError<E extends ErrorSchemaRecord | undefined = undefined>(
  error: unknown,
  errorSchema: E,
): EnvelopeError<E> {
  const response = getResponse(error)
  if (!response) {
    return { kind: 'network', cause: error }
  }

  const status = response.status
  const schema = errorSchema?.[status] as ZodType | undefined

  if (schema) {
    try {
      const parsed = schema.parse(response.data) as Record<string, unknown>
      // The http variant's body type is `z.output<E[status]> & { status }`,
      // which can only be reconstructed structurally from a runtime parse.
      // The single `as` here narrows the dynamic shape to the precise variant.
      return {
        kind: 'http',
        status,
        body: Object.freeze({ ...parsed, status }),
      } as EnvelopeError<E>
    } catch (zerr) {
      if (zerr instanceof ZodError) {
        return { kind: 'validation', status, issues: zerr.issues, body: response.data }
      }
      throw zerr
    }
  }

  return { kind: 'http-unknown', status, body: response.data }
}
