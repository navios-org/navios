import type { HttpMethod } from '../types/common.mjs'
import type { BuilderErrorEvent } from '../types/config.mjs'
import type { EnvelopeError } from '../types/envelope-error.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

/**
 * Build a structured {@link BuilderErrorEvent} from a classified {@link EnvelopeError}.
 *
 * - For `kind: 'network'`, the `cause` comes from the classified variant.
 * - For other kinds, the original thrown value is used (since `body` already
 *   carries the response payload).
 *
 * @param classified - The classified error variant
 * @param endpoint - Endpoint identification (HTTP method + URL template)
 * @param cause - The original thrown value
 */
export function buildErrorEvent<E extends ErrorSchemaRecord | undefined = undefined>(
  classified: EnvelopeError<E>,
  endpoint: { method: HttpMethod; url: string },
  cause: unknown,
): BuilderErrorEvent {
  return {
    kind: classified.kind,
    endpoint,
    status: 'status' in classified ? classified.status : undefined,
    zodIssues: classified.kind === 'validation' ? classified.issues : undefined,
    cause: classified.kind === 'network' ? classified.cause : cause,
    body: 'body' in classified ? classified.body : undefined,
  }
}
