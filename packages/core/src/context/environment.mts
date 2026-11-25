/**
 * Declares the application's adapter so that `ctx.raw` is typed:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: FastifyEnvironment
 *   }
 * }
 * ```
 */
// oxlint-disable-next-line no-empty-interface
export interface Register {}

/**
 * What an adapter contributes to the types.
 */
export interface AdapterEnvironment {
  /** The adapter's native request objects, exposed as `ctx.raw`. */
  raw: unknown
}

export type RegisteredEnvironment = Register extends {
  environment: infer E extends AdapterEnvironment
}
  ? E
  : AdapterEnvironment
