import type { InjectableScope } from '../enums/index.mjs'
import type { IContainer } from '../interfaces/container.interface.mjs'
import type { ClassType, Token } from '../token/token.mjs'

/**
 * Context passed to creation-time plugin hooks and middleware.
 *
 * Mirrors what the container has available at instantiation time: the
 * resolution {@link Token}, the concrete class {@link ClassType target},
 * the {@link InjectableScope scope}, the validated `args`, the storage
 * `instanceName` key, and the owning {@link IContainer container}. When the
 * resolution happens inside a request scope, `requestId` is populated.
 */
export interface CreateContext {
  readonly token: Token<unknown>
  readonly target: ClassType
  readonly scope: InjectableScope
  readonly args: unknown
  readonly instanceName: string
  readonly container: IContainer
  readonly requestId?: string
}

/**
 * Context passed to destroy-time plugin hooks.
 *
 * Deliberately minimal: at destroy time the only thing reliably available
 * is the storage `instanceName` key (the {@link IContainer container} that
 * owns it, and the `requestId` for request-scoped instances). The original
 * `token`/`target` are not cheaply available when a holder is invalidated
 * (see `ServiceInvalidator`), so they are intentionally NOT part of this
 * context.
 *
 * Task 4.2 (the Container wiring) may extend this shape if more fields turn
 * out to be cheaply available at invalidation time; do not depend on fields
 * beyond the ones documented here.
 */
export interface DestroyContext {
  readonly instanceName: string
  readonly container: IContainer
  readonly requestId?: string
}

/**
 * A DI plugin.
 *
 * Observer hooks (`onBefore*`/`onAfter*`/`onContainerDispose`) are pure
 * observers: they run in registration order, are awaited sequentially so
 * ordering is deterministic, and their return values are ignored.
 *
 * Crucially, an observer hook is also error-ISOLATED. If a hook throws or
 * rejects, the error does NOT propagate out of the dispatch and does NOT
 * abort the resolution that triggered it, nor does it prevent sibling
 * plugins' same-phase hooks from running. The error is instead REPORTED
 * via the {@link PluginRegistry}'s error handler (defaulting to
 * `console.error`). This is intentional: an OTEL/metrics/logging observer
 * that throws must never break `container.get()`. If a plugin needs to
 * intentionally affect or abort resolution, use `middleware` (the
 * transform layer) — not an observer hook.
 *
 * `middleware` is the only transforming hook — it is composed Koa-style
 * (outermost plugin wraps innermost, `core` is innermost). Unlike
 * observer hooks, middleware errors DO propagate (it may intentionally
 * abort resolution).
 */
export interface Plugin {
  name: string

  /**
   * Observer. Runs in registration order before instantiation. Errors are
   * isolated and reported, never propagated (see {@link Plugin}).
   */
  onBeforeCreate?(ctx: CreateContext): void | Promise<void>

  /**
   * Observer. Runs in registration order after instantiation. Errors are
   * isolated and reported, never propagated (see {@link Plugin}).
   */
  onAfterCreate?(ctx: CreateContext, instance: unknown): void | Promise<void>

  /**
   * Observer. Runs in registration order before destruction. Errors are
   * isolated and reported, never propagated (see {@link Plugin}).
   */
  onBeforeDestroy?(ctx: DestroyContext, instance: unknown): void | Promise<void>

  /**
   * Observer. Runs in registration order after destruction. Errors are
   * isolated and reported, never propagated (see {@link Plugin}).
   */
  onAfterDestroy?(ctx: DestroyContext): void | Promise<void>

  /**
   * Observer. Runs in registration order when the container disposes.
   * Errors are isolated and reported, never propagated (see {@link Plugin}).
   */
  onContainerDispose?(container: IContainer): void | Promise<void>

  /**
   * Transformation hook with `next()`. Composed Koa-style: the outermost
   * plugin's middleware wraps the next plugin's, and the innermost wraps
   * `core`. Call `next()` exactly once to continue the chain (or skip it
   * to short-circuit); the resolved value can be transformed.
   *
   * Unlike observer hooks, middleware errors are NOT isolated: a throw or
   * rejection propagates and aborts the resolution (this is the supported
   * way to intentionally fail/abort a `get()`).
   *
   * The result of `next()` MUST be returned (or awaited and returned) so
   * the resolved value propagates back up the chain. Dropping the
   * `next()` promise (calling it without returning/awaiting it) runs the
   * inner chain in the background and is a bug.
   *
   * Calling `ctx.container.get()` from middleware is supported (e.g. to
   * resolve a helper factory), but it must NOT form a cycle back to the
   * token currently being resolved — the circular-dependency detector
   * will throw.
   */
  middleware?(ctx: CreateContext, next: () => Promise<unknown>): Promise<unknown>
}

/**
 * Typed identity helper for plugin authors.
 *
 * Returns the plugin unchanged — its only purpose is to give authors type
 * inference and a stable call site when defining a plugin literal.
 */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin
}
