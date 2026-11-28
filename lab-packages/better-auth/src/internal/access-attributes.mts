import { AttributeFactory } from '@navios/server'

import type { StandardSchemaV1 } from '@navios/server'

/** What a route asks of the session. */
export type AccessLevel = 'public' | 'authenticated' | 'guest' | 'optional'

const LEVELS: readonly AccessLevel[] = ['public', 'authenticated', 'guest', 'optional']

/** A Standard Schema written out, so that the package needs no schema library. */
function schema<T>(check: (value: unknown) => string | null): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'navios-better-auth',
      validate: (value) => {
        const issue = check(value)
        return issue === null ? { value: value as T } : { issues: [{ message: issue }] }
      },
    },
  }
}

/** The access of a route; the most specific declaration counts. */
export const AccessAttribute = AttributeFactory.createAttribute(
  Symbol.for('navios:better-auth:access'),
  schema<AccessLevel>((value) =>
    LEVELS.includes(value as AccessLevel) ? null : `the access is one of ${LEVELS.join(', ')}`,
  ),
)

/** The roles a route accepts, any one of them. */
export const RolesAttribute = AttributeFactory.createAttribute(
  Symbol.for('navios:better-auth:roles'),
  schema<string[]>((value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((role) => typeof role === 'string' && role !== '')
      ? null
      : 'Roles needs at least one role, and a role is a string that is not empty',
  ),
)

/** `ApiExclude` of `@navios/openapi`, by its token, so that this package does not depend on it. */
export const OpenApiExclude = AttributeFactory.createAttribute(Symbol.for('navios:openapi:exclude'))
