import type { StandardSchemaIssue } from '@navios/core'

/**
 * A payload or a reply does not match the schema of its message declaration.
 */
export class MessageValidationError extends Error {
  constructor(
    public readonly source: 'payload' | 'reply',
    public readonly issues: readonly StandardSchemaIssue[],
  ) {
    super(`Validation failed for ${source}: ${issues.map((issue) => issue.message).join('; ')}`)
    this.name = 'MessageValidationError'
  }
}

/**
 * A guard did not let a message through.
 */
export class MessageDeniedError extends Error {
  constructor(public readonly guard: string) {
    super(`Guard ${guard} denied the message`)
    this.name = 'MessageDeniedError'
  }
}
