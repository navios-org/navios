import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/di'

import { resumeStacks, suspendStacks } from '../errors/client-error-stacks.mjs'

import { adopt } from './promises.mjs'

export type ValidationSource = 'urlParams' | 'query' | 'headers' | 'cookies' | 'body' | 'response'

/**
 * A value did not match its schema. `source` says which part of the request
 * (or the response) was being validated. For a request, the stack is captured
 * as the `clientErrorStacks` application option says.
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
    // A response that does not match is a defect of the server.
    const limit = source === 'response' ? undefined : suspendStacks()
    super(limit === undefined ? describeIssues(source, issues) : undefined)
    resumeStacks(limit)
  }
}

function describeIssues(
  source: ValidationSource,
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

/**
 * Validates `value` with any Standard Schema. Returns the validated value
 * directly when the schema validates synchronously, and a promise only when
 * the schema itself is asynchronous.
 */
export function validateSchema(
  schema: StandardSchemaV1,
  value: unknown,
  source: ValidationSource,
): unknown | Promise<unknown> {
  const result = adopt(schema['~standard'].validate(value))
  if (result instanceof Promise) {
    return result.then((settled) => {
      if (settled.issues) {
        throw new ValidationError(source, settled.issues)
      }
      return settled.value
    })
  }
  if (result.issues) {
    throw new ValidationError(source, result.issues)
  }
  return result.value
}
