import { Container, inject, Injectable, InjectableScope, InjectionToken } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StandardSchemaV1 } from '@navios/di'

import { BasicExecutionContext } from '../execution/basic-execution-context.mjs'
import { createContextHost } from '../execution/context-host.mjs'
import { createContextKey } from '../execution/context-key.mjs'
import { ExecutionContextToken } from '../execution/execution-context-token.mjs'

import type { ContextHost } from '../execution/context-host.mjs'
import type { ExecutionContext, HandlerInfo } from '../execution/execution-context.mjs'

class Owner {}
class OwnerModule {}

const handler: HandlerInfo = {
  module: OwnerModule,
  controller: Owner,
  handlerName: 'run',
  guards: [],
  interceptors: [],
  attributes: { handler: new Map(), controller: new Map(), module: new Map() },
}

describe('BasicExecutionContext', () => {
  let container: Container
  let host: ContextHost
  let ctx: BasicExecutionContext

  beforeEach(() => {
    container = new Container()
    host = { container, onScopedUse: null }
    ctx = new BasicExecutionContext({ kind: 'test', id: 'run-1', handler, host })
  })

  afterEach(async () => {
    await ctx.finish()
    await container.dispose()
  })

  it('reports what it was created with', () => {
    expect(ctx.kind).toBe('test')
    expect(ctx.id).toBe('run-1')
    expect(ctx.handler).toBe(handler)
    expect(ctx.signal.aborted).toBe(false)
  })

  it('stores and reads keys', () => {
    const Tenant = createContextKey<string>('Tenant')
    const Missing = createContextKey<string>('Missing')

    ctx.set(Tenant, 'acme')

    expect(ctx.get(Tenant)).toBe('acme')
    expect(ctx.has(Tenant)).toBe(true)
    expect(ctx.has(Missing)).toBe(false)
    expect(ctx.find(Missing)).toBeUndefined()
    expect(() => ctx.get(Missing)).toThrow('Context key Missing is not set')
  })

  it('creates one scope and disposes it on finish', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {
      readonly ctx: ExecutionContext = inject(ExecutionContextToken)
      destroyed = false
      onServiceDestroy() {
        this.destroyed = true
      }
    }

    const first = ctx.use(Scoped)
    expect(ctx.use(Scoped)).toBe(first)
    expect(await ctx.resolve(Scoped)).toBe(first)
    expect(first.ctx).toBe(ctx)

    await ctx.finish()

    expect(first.destroyed).toBe(true)
    expect(() => ctx.use(Scoped)).toThrow('has finished')
  })

  it('runs finishers in reverse, once, despite a throwing one', async () => {
    const order: string[] = []
    ctx.onFinish(() => {
      order.push('a')
    })
    ctx.onFinish(() => {
      throw new Error('boom')
    })
    ctx.onFinish(async () => {
      order.push('b')
    })

    await ctx.finish()
    await ctx.finish()

    expect(order).toEqual(['b', 'a'])
  })

  it('reports a throwing finisher to the logger of the host', async () => {
    const error = vi.fn()
    const failure = new Error('finisher failed')
    const logged = new BasicExecutionContext({
      kind: 'test',
      id: 'run-2',
      handler,
      host: { ...host, logger: { error } },
    })
    logged.onFinish(() => {
      throw failure
    })

    await expect(logged.finish()).resolves.toBeUndefined()
    logged.onFinish(async () => {
      throw failure
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0]).toContain(failure)
  })

  it('runs a finisher registered after finish at once', async () => {
    await ctx.finish()
    const late = vi.fn()

    ctx.onFinish(late)

    expect(late).toHaveBeenCalledTimes(1)
  })

  it('calls onScopedUse', () => {
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {}
    const onScopedUse = vi.fn()
    host.onScopedUse = onScopedUse

    ctx.use(Scoped)

    expect(onScopedUse).toHaveBeenCalledWith(Scoped)
  })

  it('runs a callback that a callback registered, before the scope is disposed', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {
      destroyed = false
      onServiceDestroy() {
        this.destroyed = true
      }
    }
    const scoped = ctx.use(Scoped)
    let destroyedWhenNestedRan: boolean | null = null
    ctx.onFinish(() => {
      ctx.onFinish(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        destroyedWhenNestedRan = scoped.destroyed
      })
    })

    await ctx.finish()

    expect(destroyedWhenNestedRan).toBe(false)
    expect(scoped.destroyed).toBe(true)
  })

  it('lets a callback use request-scoped services, also as the first to do so', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {
      destroyed = false
      onServiceDestroy() {
        this.destroyed = true
      }
    }
    let scoped: Scoped | undefined
    ctx.onFinish(() => {
      scoped = ctx.use(Scoped)
    })

    await ctx.finish()

    expect(scoped?.destroyed).toBe(true)
  })

  it('gives every caller of finish() the same run', async () => {
    const log: string[] = []
    ctx.onFinish(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      log.push('finisher')
    })

    const first = ctx.finish()
    await ctx.finish().then(() => log.push('second finish() resolved'))
    await first

    expect(log).toEqual(['finisher', 'second finish() resolved'])
  })

  it('has a signal of its own unless the transport gives one', () => {
    const controller = new AbortController()
    const create = (signal?: AbortSignal) =>
      new BasicExecutionContext({ kind: 'test', id: 'run', handler, host, signal })
    const other = create()

    expect(ctx.signal).toBe(ctx.signal)
    expect(other.signal).not.toBe(ctx.signal)
    expect(other.signal.aborted).toBe(false)
    expect(create(controller.signal).signal).toBe(controller.signal)
  })

  it('resolves a singleton without a DI scope, also after it has finished', async () => {
    @Injectable()
    class Shared {}
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {}
    const createScope = vi.spyOn(container, 'createScope')

    const shared = ctx.use(Shared)
    expect(await ctx.resolve(Shared)).toBe(shared)
    expect(createScope).not.toHaveBeenCalled()

    ctx.use(Scoped)
    expect(ctx.use(Shared)).toBe(shared)
    expect(createScope).toHaveBeenCalledTimes(1)
    await ctx.finish()
    expect(ctx.use(Shared)).toBe(shared)
  })
})

describe('createContextHost', () => {
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() }
  let container: Container

  beforeEach(() => {
    container = new Container()
    logger.warn.mockClear()
  })

  afterEach(async () => {
    await container.dispose()
  })

  const run = (mode: 'allow' | 'warn' | 'forbid') => {
    const host = createContextHost(container, mode, logger)
    return () => new BasicExecutionContext({ kind: 'test', id: 'run', handler, host })
  }

  it('applies the policy to request-scoped services only', async () => {
    @Injectable()
    class Shared {}
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {}
    const forbidden = run('forbid')()
    const warned = run('warn')()

    expect(forbidden.use(Shared)).toBeInstanceOf(Shared)
    expect(() => forbidden.use(Scoped)).toThrow('Scoped was requested with ctx.use()')
    warned.use(Shared)
    expect(logger.warn).not.toHaveBeenCalled()
    warned.use(Scoped)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    await warned.finish()
  })

  it('warns once about a token, whatever it is bound to', async () => {
    class Tenant {}
    const Token = InjectionToken.create<Tenant, StandardSchemaV1<{ id: number }>>('Tenant', {
      '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value: value as any }) },
    })
    Injectable({ scope: InjectableScope.Request, token: Token })(Tenant, {
      kind: 'class',
      metadata: {},
    } as ClassDecoratorContext)
    const create = run('warn')

    for (let id = 0; id < 5; id++) {
      const ctx = create()
      ctx.use(InjectionToken.bound(Token, { id }))
      await ctx.finish()
    }

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('Tenant is resolved for every execution')
  })
})
