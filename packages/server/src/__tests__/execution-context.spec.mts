import { builder } from '@navios/builder'
import {
  Container,
  currentContext as kernelCurrentContext,
  ExecutionContextToken,
} from '@navios/core'
import { BasicExecutionContext } from '@navios/core/transport'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { ExecutionContext } from '@navios/core'

import {
  AttributeFactory,
  Controller,
  currentContext as httpCurrentContext,
  handler,
  inject,
  Injectable,
  InjectableScope,
  isHttpContext,
  Module,
  NaviosFactory,
} from '../index.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

import type { NaviosApplication, NaviosApplicationOptions } from '../index.mjs'

const api = builder()

const probe = api.declareEndpoint({
  method: 'GET',
  url: '/users/me',
  responseSchema: z.any(),
})

const apps: NaviosApplication<any>[] = []

async function createApp(
  module: new () => unknown,
  options: Partial<NaviosApplicationOptions<any>> = {},
) {
  const app = await NaviosFactory.create(module, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    ...options,
  })
  apps.push(app)
  return app
}

afterEach(async () => {
  while (apps.length > 0) {
    await apps.pop()!.close()
  }
})

describe('RequestContext as an ExecutionContext', () => {
  it('exposes kind and handler on the request context', async () => {
    @Controller()
    class Ctl {
      probe = handler(probe, (_params, ctx) => ({
        kind: ctx.kind,
        same: ctx.handler === ctx.route,
      }))
    }
    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    expect((await createTestClient(app)(probe)).body).toEqual({ kind: 'http', same: true })
  })

  it('adds no own property to a request context', async () => {
    @Controller()
    class Ctl {
      probe = handler(probe, (_params, ctx) => Object.keys(ctx))
    }
    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    const keys = (await createTestClient(app)(probe)).body as string[]
    expect(keys).not.toContain('kind')
    expect(keys).not.toContain('handler')
  })

  it('resolves the neutral context token in the request scope', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class Scoped {
      readonly ctx: ExecutionContext = inject(ExecutionContextToken)
    }
    @Controller()
    class Ctl {
      probe = handler(probe, (_params, ctx) => ctx.use(Scoped).ctx === ctx)
    }
    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root, { requestScopedServices: 'allow' })
    expect((await createTestClient(app)(probe)).body).toBe(true)
  })

  it('returns the request context from both currentContext functions', async () => {
    @Controller()
    class Ctl {
      probe = handler(probe, async (_params, ctx) => {
        await Promise.resolve()
        return { kernel: kernelCurrentContext() === ctx, http: httpCurrentContext() === ctx }
      })
    }
    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root, { asyncContext: true })
    expect((await createTestClient(app)(probe)).body).toEqual({ kernel: true, http: true })
  })

  it('reads an attribute from ctx.handler', async () => {
    const Roles = AttributeFactory.createAttribute(
      Symbol.for('test.exec.Roles'),
      z.array(z.string()),
    )
    @Controller()
    class Ctl {
      @Roles(['admin'])
      probe = handler(probe, (_params, ctx) => AttributeFactory.get(Roles, ctx.handler))
    }
    @Module({ controllers: [Ctl] })
    class Root {}

    const app = await createApp(Root)
    expect((await createTestClient(app)(probe)).body).toEqual(['admin'])
  })

  it("tells an HTTP context from another transport's", async () => {
    @Controller()
    class Ctl {
      probe = handler(probe, (_params, ctx) => isHttpContext(ctx))
    }
    @Module({ controllers: [Ctl] })
    class Root {}
    const other = new BasicExecutionContext({
      kind: 'queue',
      id: 'job-1',
      host: { container: new Container(), onScopedUse: null },
      handler: {
        module: Root,
        controller: Ctl,
        handlerName: 'run',
        guards: [],
        interceptors: [],
        attributes: { handler: new Map(), controller: new Map(), module: new Map() },
      },
    })

    const app = await createApp(Root)

    expect((await createTestClient(app)(probe)).body).toBe(true)
    expect(isHttpContext(other)).toBe(false)
  })
})
