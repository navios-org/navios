import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import {
  handler,
  NaviosFactory,
  registerController,
  registerInjectable,
  registerModule,
} from '@navios/server'

import type { Guard, NaviosApplication, RequestContext } from '@navios/server'

import { defineBunEnvironment } from '../src/index.mjs'

import type { BunEnvironment } from '../src/index.mjs'

// The conformance suite checks what ctx.toWebRequest() holds. These are the
// cases of this adapter: the request Bun received, untouched, is handed on.
describe('bun adapter: ctx.toWebRequest()', () => {
  let app: NaviosApplication<BunEnvironment>
  let base: string

  beforeAll(async () => {
    class ReadsBody implements Guard {
      async canActivate(ctx: RequestContext) {
        await ctx.rawBody()
        return true
      }
    }
    registerInjectable(ReadsBody)

    class WebRequestController {
      native = handler(
        { config: { method: 'POST', url: '/native/$path*' } } as any,
        async (_params: unknown, ctx: RequestContext) => {
          const request = await ctx.toWebRequest()
          const { raw } = ctx as unknown as { raw: BunEnvironment['raw'] }
          return { isNative: request === raw.request, body: await request.text() }
        },
      )
      afterGuard = handler(
        { config: { method: 'POST', url: '/after-guard' } } as any,
        { guards: [ReadsBody] },
        async (_params: unknown, ctx: RequestContext) => {
          const request = await ctx.toWebRequest()
          const { raw } = ctx as unknown as { raw: BunEnvironment['raw'] }
          return { isNative: request === raw.request, body: await request.text() }
        },
      )
    }
    registerController(WebRequestController)

    class AppModule {}
    registerModule(AppModule, { controllers: [WebRequestController] })

    app = await NaviosFactory.create(AppModule, {
      adapter: defineBunEnvironment(),
      logger: false,
    })
    base = await app.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await app.close()
  })

  it('hands on the request Bun received while its body is unread', async () => {
    const response = await fetch(`${base}/native/a/b`, { method: 'POST', body: 'payload' })

    expect(await response.json()).toEqual({ isNative: true, body: 'payload' })
  })

  it('builds a request with the body once a guard has read it', async () => {
    const response = await fetch(`${base}/after-guard`, { method: 'POST', body: 'payload' })

    expect(await response.json()).toEqual({ isNative: false, body: 'payload' })
  })
})
