import { describe, expect, it } from 'vitest'

import { InjectableScope } from '../enums/index.mjs'
import { definePlugin, PluginRegistry } from '../plugin/index.mjs'
import { Token } from '../token/token.mjs'

import type { IContainer } from '../interfaces/index.mjs'
import type { CreateContext, DestroyContext, Plugin } from '../plugin/index.mjs'

class Sample {}

const fakeContainer = {} as IContainer

function makeCreateContext(): CreateContext {
  return {
    token: Token.create<Sample>('Sample'),
    target: Sample,
    scope: InjectableScope.Singleton,
    args: undefined,
    instanceName: 'Sample',
    container: fakeContainer,
  }
}

function makeDestroyContext(): DestroyContext {
  return {
    instanceName: 'Sample',
    container: fakeContainer,
  }
}

describe('definePlugin', () => {
  it('returns the same plugin (identity)', () => {
    const plugin: Plugin = { name: 'p' }
    expect(definePlugin(plugin)).toBe(plugin)
  })

  it('preserves typing / hook shape', () => {
    const order: string[] = []
    const plugin = definePlugin({
      name: 'typed',
      onBeforeCreate() {
        order.push('before')
      },
    })
    expect(plugin.name).toBe('typed')
    expect(typeof plugin.onBeforeCreate).toBe('function')
  })
})

describe('PluginRegistry registration', () => {
  it('makes constructor plugins observable via getAll() in registration order', () => {
    const a: Plugin = { name: 'a' }
    const b: Plugin = { name: 'b' }
    const registry = new PluginRegistry([a, b])
    expect(registry.getAll()).toEqual([a, b])
  })

  it('defaults to empty plugin list', () => {
    const registry = new PluginRegistry()
    expect(registry.getAll()).toEqual([])
  })

  it('register() adds a plugin in registration order', () => {
    const a: Plugin = { name: 'a' }
    const b: Plugin = { name: 'b' }
    const c: Plugin = { name: 'c' }
    const registry = new PluginRegistry([a])
    registry.register(b)
    registry.use(c)
    expect(registry.getAll()).toEqual([a, b, c])
  })
})

describe('PluginRegistry.runMiddleware', () => {
  it('composes plugins outer to inner Koa-style', async () => {
    const order: string[] = []
    const mw1: Plugin = {
      name: 'mw1',
      async middleware(_ctx, next) {
        order.push('a-before')
        const result = await next()
        order.push('a-after')
        return result
      },
    }
    const mw2: Plugin = {
      name: 'mw2',
      async middleware(_ctx, next) {
        order.push('b-before')
        const result = await next()
        order.push('b-after')
        return result
      },
    }
    const registry = new PluginRegistry([mw1, mw2])
    const result = await registry.runMiddleware(makeCreateContext(), async () => {
      order.push('core')
      return 'core-result'
    })
    expect(order).toEqual(['a-before', 'b-before', 'core', 'b-after', 'a-after'])
    expect(result).toBe('core-result')
  })

  it('short-circuits when a middleware does not call next()', async () => {
    const order: string[] = []
    const mw1: Plugin = {
      name: 'mw1',
      async middleware(_ctx, _next) {
        order.push('a')
        return 'short'
      },
    }
    const mw2: Plugin = {
      name: 'mw2',
      async middleware(_ctx, next) {
        order.push('b')
        return next()
      },
    }
    const registry = new PluginRegistry([mw1, mw2])
    const result = await registry.runMiddleware(makeCreateContext(), async () => {
      order.push('core')
      return 'core-result'
    })
    expect(order).toEqual(['a'])
    expect(result).toBe('short')
  })

  it('lets a middleware transform the result', async () => {
    const mw: Plugin = {
      name: 'mw',
      async middleware(_ctx, next) {
        const result = await next()
        return { wrapped: result }
      },
    }
    const registry = new PluginRegistry([mw])
    const result = await registry.runMiddleware(makeCreateContext(), async () => 'inner')
    expect(result).toEqual({ wrapped: 'inner' })
  })

  it('runs core directly when no middleware plugins', async () => {
    const registry = new PluginRegistry([{ name: 'noop' }])
    const result = await registry.runMiddleware(makeCreateContext(), async () => 'core-only')
    expect(result).toBe('core-only')
  })

  it('throws when next() is called multiple times', async () => {
    const mw: Plugin = {
      name: 'mw',
      async middleware(_ctx, next) {
        await next()
        return next()
      },
    }
    const registry = new PluginRegistry([mw])
    await expect(registry.runMiddleware(makeCreateContext(), async () => 'core')).rejects.toThrow(
      'next() called multiple times',
    )
  })
})

describe('PluginRegistry lifecycle hooks', () => {
  it('runs onBeforeCreate in registration order, awaited sequentially', async () => {
    const order: string[] = []
    const p1: Plugin = {
      name: 'p1',
      async onBeforeCreate() {
        await Promise.resolve()
        order.push('p1')
      },
    }
    const p2: Plugin = {
      name: 'p2',
      onBeforeCreate() {
        order.push('p2')
      },
    }
    const registry = new PluginRegistry([p1, p2])
    await registry.runBeforeCreate(makeCreateContext())
    expect(order).toEqual(['p1', 'p2'])
  })

  it('runs onAfterCreate in registration order with the instance', async () => {
    const seen: unknown[] = []
    const instance = { id: 1 }
    const p1: Plugin = {
      name: 'p1',
      onAfterCreate(_ctx, inst) {
        seen.push(['p1', inst])
      },
    }
    const p2: Plugin = {
      name: 'p2',
      onAfterCreate(_ctx, inst) {
        seen.push(['p2', inst])
      },
    }
    const registry = new PluginRegistry([p1, p2])
    await registry.runAfterCreate(makeCreateContext(), instance)
    expect(seen).toEqual([
      ['p1', instance],
      ['p2', instance],
    ])
  })

  it('runs onBeforeDestroy / onAfterDestroy in registration order', async () => {
    const order: string[] = []
    const p1: Plugin = {
      name: 'p1',
      onBeforeDestroy() {
        order.push('before-1')
      },
      onAfterDestroy() {
        order.push('after-1')
      },
    }
    const p2: Plugin = {
      name: 'p2',
      onBeforeDestroy() {
        order.push('before-2')
      },
      onAfterDestroy() {
        order.push('after-2')
      },
    }
    const registry = new PluginRegistry([p1, p2])
    await registry.runBeforeDestroy(makeDestroyContext(), { id: 1 })
    await registry.runAfterDestroy(makeDestroyContext())
    expect(order).toEqual(['before-1', 'before-2', 'after-1', 'after-2'])
  })

  it('runs onContainerDispose in registration order, awaited', async () => {
    const order: string[] = []
    const p1: Plugin = {
      name: 'p1',
      async onContainerDispose() {
        await Promise.resolve()
        order.push('p1')
      },
    }
    const p2: Plugin = {
      name: 'p2',
      onContainerDispose() {
        order.push('p2')
      },
    }
    const registry = new PluginRegistry([p1, p2])
    await registry.runContainerDispose(fakeContainer)
    expect(order).toEqual(['p1', 'p2'])
  })

  it('silently skips plugins missing a particular hook', async () => {
    const order: string[] = []
    const p1: Plugin = { name: 'p1' }
    const p2: Plugin = {
      name: 'p2',
      onBeforeCreate() {
        order.push('p2')
      },
    }
    const registry = new PluginRegistry([p1, p2])
    await expect(registry.runBeforeCreate(makeCreateContext())).resolves.toBeUndefined()
    await registry.runAfterCreate(makeCreateContext(), {})
    await registry.runBeforeDestroy(makeDestroyContext(), {})
    await registry.runAfterDestroy(makeDestroyContext())
    await registry.runContainerDispose(fakeContainer)
    expect(order).toEqual(['p2'])
  })
})
