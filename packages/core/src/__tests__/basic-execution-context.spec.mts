import { Container, inject, Injectable, InjectableScope } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BasicExecutionContext } from '../execution/basic-execution-context.mjs'
import { createContextKey } from '../execution/context-key.mjs'
import { ExecutionContextToken } from '../execution/execution-context-token.mjs'

import type { ContextHost } from '../execution/context-host.mjs'
import type { ExecutionContext, HandlerInfo } from '../execution/execution-context.mjs'

class Owner {}

const handler: HandlerInfo = {
  module: null,
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
})
