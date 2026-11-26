import { HttpException } from '../errors/http-exception.mjs'
import { problem } from '../errors/problem.mjs'
import { ValidationError } from '../errors/validation-error.mjs'

import type { RouteResult } from '../routing/route-result.mjs'

/**
 * The error for a request body over the adapter's limit: a 413. Throw it while
 * the body is read; answer one that the server reports before the executor
 * runs with `context.errors.unexpected(bodyTooLarge())`.
 */
export function bodyTooLarge(): HttpException {
  return new HttpException(413, 'Request body is too large')
}

/** The error for a request body whose client left before it had sent all of it: a 400. */
export function incompleteBody(cause?: unknown): HttpException {
  return new HttpException(400, 'The request body is incomplete', cause)
}

/** The error for a multipart body that cannot be parsed: a 400. */
export function malformedMultipart(cause: unknown): ValidationError {
  const detail = cause instanceof Error ? `: ${cause.message}` : ''
  return new ValidationError('body', [{ message: `Malformed multipart body${detail}` }])
}

/**
 * The answer to a request whose path is not valid percent-encoding, which no
 * route can match: a 400, as Fastify's router gives it. `path` is the
 * `canonicalPath()` of the request target.
 */
export function malformedPath(path: string): RouteResult {
  return problem(400, `'${path}' is not a valid url component`)
}
