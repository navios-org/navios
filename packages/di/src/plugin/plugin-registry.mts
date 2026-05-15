import type { IContainer } from '../interfaces/container.interface.mjs'

import type { CreateContext, DestroyContext, Plugin } from './plugin.mjs'

/**
 * Holds the ordered list of plugins, composes their middleware Koa-style,
 * and dispatches the fire-and-forget lifecycle hooks in registration order.
 *
 * This is purely a foundation: it is NOT wired into the Container here
 * (Task 4.2 does that). It only knows how to register plugins and run
 * their hooks/middleware.
 */
export class PluginRegistry {
  private readonly plugins: Plugin[]

  constructor(plugins: Plugin[] = []) {
    this.plugins = [...plugins]
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
   * sequentially. Plugins without the hook are skipped silently.
   */
  async runBeforeCreate(ctx: CreateContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onBeforeCreate) {
        await plugin.onBeforeCreate(ctx)
      }
    }
  }

  /**
   * Runs every plugin's `onAfterCreate` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently.
   */
  async runAfterCreate(ctx: CreateContext, instance: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onAfterCreate) {
        await plugin.onAfterCreate(ctx, instance)
      }
    }
  }

  /**
   * Runs every plugin's `onBeforeDestroy` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently.
   */
  async runBeforeDestroy(ctx: DestroyContext, instance: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onBeforeDestroy) {
        await plugin.onBeforeDestroy(ctx, instance)
      }
    }
  }

  /**
   * Runs every plugin's `onAfterDestroy` in registration order, awaited
   * sequentially. Plugins without the hook are skipped silently.
   */
  async runAfterDestroy(ctx: DestroyContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onAfterDestroy) {
        await plugin.onAfterDestroy(ctx)
      }
    }
  }

  /**
   * Runs every plugin's `onContainerDispose` in registration order,
   * awaited sequentially. Plugins without the hook are skipped silently.
   */
  async runContainerDispose(container: IContainer): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onContainerDispose) {
        await plugin.onContainerDispose(container)
      }
    }
  }
}
