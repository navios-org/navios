import type { IContainer } from '../interfaces/container.interface.mjs'

import type { CreateContext, DestroyContext, Plugin } from './plugin.mjs'

/**
 * Called when an observer hook throws or rejects. `phase` is the hook
 * name (e.g. `'onAfterCreate'`). The error is already isolated by the
 * time this is called — it will not propagate or abort resolution.
 */
export type PluginErrorHandler = (error: unknown, plugin: Plugin, phase: string) => void

/**
 * Holds the ordered list of plugins, composes their middleware Koa-style,
 * and dispatches the lifecycle observer hooks in registration order.
 *
 * Observer hooks (`onBefore*`/`onAfter*`/`onContainerDispose`) are
 * error-ISOLATED per plugin: a throwing/rejecting hook does not propagate
 * out of the `run*` dispatch, does not abort the (Task 4.2) resolution
 * that triggered it, and does not stop subsequent plugins' same-phase
 * hooks from running. Caught errors are REPORTED via the optional
 * `onPluginError` handler (defaulting to `console.error`) so plugin
 * authors still get a signal. Use `middleware` if you need to
 * intentionally affect/abort resolution — middleware errors DO propagate
 * (see {@link PluginRegistry.runMiddleware}).
 *
 * This is purely a foundation: it is NOT wired into the Container here
 * (Task 4.2 does that). It only knows how to register plugins and run
 * their hooks/middleware.
 */
export class PluginRegistry {
  private readonly plugins: Plugin[]
  private readonly onPluginError?: PluginErrorHandler

  constructor(plugins: Plugin[] = [], onPluginError?: PluginErrorHandler) {
    this.plugins = [...plugins]
    this.onPluginError = onPluginError
  }

  /**
   * Routes an isolated observer-hook error. When an explicit handler was
   * supplied it is used; otherwise we fall back to `console.error` (guarded
   * so it is safe if `console` is absent) rather than swallowing silently —
   * a silent swallow would leave plugin authors with zero signal.
   *
   * Task 4.2 (Container wiring) will pass a container-logger-backed handler.
   */
  private reportPluginError(error: unknown, plugin: Plugin, phase: string): void {
    if (this.onPluginError) {
      this.onPluginError(error, plugin, phase)
      return
    }
    globalThis.console?.error?.(
      `[navios/di] plugin "${plugin.name}" ${phase} hook failed`,
      error,
    )
  }

  /**
   * Registers a plugin. Registration order is preserved and is the order
   * in which observer hooks run and middleware is composed (outermost
   * first).
   */
  register(plugin: Plugin): void {
    this.plugins.push(plugin)
  }

  /**
   * Alias of {@link PluginRegistry.register} for ergonomic call sites.
   */
  use(plugin: Plugin): void {
    this.register(plugin)
  }

  /**
   * Returns the registered plugins in registration order.
   */
  getAll(): readonly Plugin[] {
    return this.plugins
  }

  /**
   * Composes every plugin's `middleware` Koa-style around `core`.
   *
   * The first registered plugin is the outermost wrapper; `core` is the
   * innermost. A middleware that does not call `next()` short-circuits the
   * chain (inner middleware and `core` are skipped). Calling `next()` more
   * than once throws `'next() called multiple times'`.
   *
   * Unlike observer hooks, middleware errors are NOT isolated: a throw or
   * rejection propagates and rejects this call (middleware is the
   * transform layer and may intentionally abort resolution).
   */
  async runMiddleware(ctx: CreateContext, core: () => Promise<unknown>): Promise<unknown> {
    const mws = this.plugins.filter((p) => p.middleware).map((p) => p.middleware!.bind(p))
    let i = -1
    const dispatch = (idx: number): Promise<unknown> => {
      if (idx <= i) {
        throw new Error('next() called multiple times')
      }
      i = idx
      const fn = idx < mws.length ? mws[idx] : null
      if (!fn) {
        return core()
      }
      return fn(ctx, () => dispatch(idx + 1))
    }
    return dispatch(0)
  }

  /**
   * Runs every plugin's `onBeforeCreate` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently. Each
   * invocation is error-isolated: a throwing/rejecting hook is caught and
   * reported, never propagated, and does not stop the next plugin's hook.
   */
  async runBeforeCreate(ctx: CreateContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onBeforeCreate) {
        try {
          await plugin.onBeforeCreate(ctx)
        } catch (err) {
          this.reportPluginError(err, plugin, 'onBeforeCreate')
        }
      }
    }
  }

  /**
   * Runs every plugin's `onAfterCreate` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently. Each
   * invocation is error-isolated: a throwing/rejecting hook is caught and
   * reported, never propagated, and does not stop the next plugin's hook.
   */
  async runAfterCreate(ctx: CreateContext, instance: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onAfterCreate) {
        try {
          await plugin.onAfterCreate(ctx, instance)
        } catch (err) {
          this.reportPluginError(err, plugin, 'onAfterCreate')
        }
      }
    }
  }

  /**
   * Runs every plugin's `onBeforeDestroy` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently. Each
   * invocation is error-isolated: a throwing/rejecting hook is caught and
   * reported, never propagated, and does not stop the next plugin's hook.
   */
  async runBeforeDestroy(ctx: DestroyContext, instance: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onBeforeDestroy) {
        try {
          await plugin.onBeforeDestroy(ctx, instance)
        } catch (err) {
          this.reportPluginError(err, plugin, 'onBeforeDestroy')
        }
      }
    }
  }

  /**
   * Runs every plugin's `onAfterDestroy` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently. Each
   * invocation is error-isolated: a throwing/rejecting hook is caught and
   * reported, never propagated, and does not stop the next plugin's hook.
   */
  async runAfterDestroy(ctx: DestroyContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onAfterDestroy) {
        try {
          await plugin.onAfterDestroy(ctx)
        } catch (err) {
          this.reportPluginError(err, plugin, 'onAfterDestroy')
        }
      }
    }
  }

  /**
   * Runs every plugin's `onContainerDispose` in registration order,
   * awaited sequentially. Plugins without the hook are skipped silently.
   * Each invocation is error-isolated: a throwing/rejecting hook is
   * caught and reported, never propagated, and does not stop the next
   * plugin's hook.
   */
  async runContainerDispose(container: IContainer): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onContainerDispose) {
        try {
          await plugin.onContainerDispose(container)
        } catch (err) {
          this.reportPluginError(err, plugin, 'onContainerDispose')
        }
      }
    }
  }
}
