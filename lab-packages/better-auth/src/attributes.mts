import { AttributeFactory } from '@navios/server'

/**
 * Lets a request through `BetterAuthGuard` without a session. Put it on a handler, a controller
 * or a module. The session can still be read there, with `ctx.get(AuthSession)`.
 *
 * ```ts
 * @AllowAnonymous()
 * @Endpoint(listPublicNotes)
 * listPublic() {}
 * ```
 */
export const AllowAnonymous = AttributeFactory.createAttribute(
  Symbol.for('navios:better-auth:allow-anonymous'),
)

/**
 * `ApiExclude` of `@navios/openapi`, by its token, so that this package does not depend on it.
 * @internal
 */
export const OpenApiExclude = AttributeFactory.createAttribute(Symbol.for('navios:openapi:exclude'))
