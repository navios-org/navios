import { UseGuards } from '@navios/server'

import { BetterAuthGuard } from './better-auth-guard.mjs'
import { AccessAttribute, RolesAttribute } from './internal/access-attributes.mjs'

import type { AccessLevel } from './internal/access-attributes.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type DecoratorContext =
  | ClassDecoratorContext
  | ClassMethodDecoratorContext
  | ClassFieldDecoratorContext

/** A decorator for a module, a controller, a handler method or a `handler()` field. */
export type AccessDecorator = (target: any, context: DecoratorContext) => any

/** Applies several decorators as one. */
function combine(...decorators: AccessDecorator[]): AccessDecorator {
  return (target, context) => {
    let result: unknown
    for (const decorator of decorators) {
      result = decorator(target, context)
    }
    return result
  }
}

/** The access, and the guard that acts on it. */
function guarded(level: AccessLevel, ...more: AccessDecorator[]): AccessDecorator {
  return combine(AccessAttribute(level), ...more, UseGuards(BetterAuthGuard))
}

/**
 * Needs a signed-in user: 401 without one. The handler reads it with `ctx.get(CurrentUser)`.
 * On a module or a controller it covers every route below that does not declare otherwise.
 *
 * ```ts
 * @Authenticated()
 * @Controller()
 * export class NotesController {}
 * ```
 */
export function Authenticated(): AccessDecorator {
  return guarded('authenticated')
}

/**
 * Needs a signed-in user with one of the roles: 401 without a user, 403 for another role. Roles
 * are read from `user.role`, which Better Auth's admin plugin keeps as a comma-separated list.
 *
 * ```ts
 * @Roles('admin')
 * @Endpoint(purgeNotes)
 * purge() {}
 * ```
 */
export function Roles(...roles: [string, ...string[]]): AccessDecorator {
  return guarded('authenticated', RolesAttribute(roles))
}

/** Only for a visitor who is not signed in, such as a registration form: 403 for a user. */
export function Guest(): AccessDecorator {
  return guarded('guest')
}

/** Lets everyone through, and gives the handler the user when there is one: `ctx.find(CurrentUser)`. */
export function OptionalAuth(): AccessDecorator {
  return guarded('optional')
}

/**
 * No check, and no session lookup, for a route below a module or a controller that declares
 * one. A route without any access decorator is not checked either.
 */
export function Public(): AccessDecorator {
  return AccessAttribute('public')
}
