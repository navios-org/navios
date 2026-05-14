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
export function classifyError(
  error: unknown,
  errorSchema: ErrorSchemaRecord | undefined,
): EnvelopeError {
  const response = getResponse(error)
  if (!response) {
    return { kind: 'network', cause: error }
  }

  const status = response.status
  const schema = errorSchema?.[status] as ZodType | undefined

  if (schema) {
    try {
      const parsed = schema.parse(response.data) as Record<string, unknown>
      // The 'http' variant is dropped from EnvelopeError<undefined> structurally;
      // callers with a concrete E will narrow it back. Cast through unknown.
      return {
        kind: 'http',
        status,
        // status is injected for body-level discrimination; the field is read-only
        body: Object.freeze({ ...parsed, status }),
      } as unknown as EnvelopeError
    } catch (zerr) {
      if (zerr instanceof ZodError) {
        return { kind: 'validation', status, issues: zerr.issues, body: response.data }
      }
      throw zerr
    }
  }

  return { kind: 'http-unknown', status, body: response.data }
}
