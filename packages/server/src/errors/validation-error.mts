import type { StandardSchemaIssue } from '@navios/di'

import { resumeStacks, suspendStacks } from './client-error-stacks.mjs'

/** The part of a request that a schema validates. */
export type ValidationSource = 'urlParams' | 'query' | 'headers' | 'cookies' | 'body'

/**
 * A part of the request did not match its schema: a client error, answered
 * with a 400. `source` says which part. The stack is captured as the
 * `clientErrorStacks` application option says.
 */
export class ValidationError extends Error {
  static {
    Object.defineProperties(this.prototype, {
      name: { value: 'ValidationError', writable: true, configurable: true },
      // The response is built from `issues`, so without a stack the message
      // is only formatted when something reads it.
      message: {
        get(this: ValidationError): string {
          return describeIssues(this.source, this.issues)
        },
        set(this: ValidationError, value: string) {
          Object.defineProperty(this, 'message', { value, writable: true, configurable: true })
        },
        configurable: true,
      },
    })
  }

  constructor(
    public readonly source: ValidationSource,
    public readonly issues: ReadonlyArray<StandardSchemaIssue>,
  ) {
    const limit = suspendStacks()
    super(limit === undefined ? describeIssues(source, issues) : undefined)
    resumeStacks(limit)
  }
}

/**
 * A response did not match its schema: what a handler returned, the body of
 * an `HttpException` for a status the endpoint declares, or the payload of an
 * event. A defect of the server, answered with a 500 and reported like any
 * other. It is not a `ValidationError`, so a mapper for that class does not
 * see it.
 */
export class ResponseValidationError extends Error {
  static {
    Object.defineProperty(this.prototype, 'name', {
      value: 'ResponseValidationError',
      writable: true,
      configurable: true,
    })
  }

  constructor(public readonly issues: ReadonlyArray<StandardSchemaIssue>) {
    super(describeIssues('response', issues))
  }
}

function describeIssues(
  source: ValidationSource | 'response',
  issues: ReadonlyArray<StandardSchemaIssue>,
): string {
  return `Validation failed for ${source}: ${issues
    .map((issue) => {
      const path = formatPath(issue.path)
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')}`
}

export function formatPath(path: StandardSchemaIssue['path']): string {
  if (!path || path.length === 0) {
    return ''
  }
  return path
    .map((segment) =>
      String(typeof segment === 'object' && segment !== null ? segment.key : segment),
    )
    .join('.')
}
