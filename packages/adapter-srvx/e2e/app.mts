import {
  handler,
  NaviosFactory,
  registerController,
  registerModule,
  sseStream,
} from '@navios/server'

import type { LoggerService, NaviosApplication, RequestContext } from '@navios/server'

import { defineSrvxEnvironment } from '../src/index.mjs'

import type { SrvxAdapterOptions, SrvxEnvironment } from '../src/index.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const anything = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value }),
  },
}

const raw = (ctx: RequestContext) => ctx.raw as SrvxEnvironment['raw']

/** An application with the routes that the tests of this adapter ask. */
export async function createApp(
  options: SrvxAdapterOptions = {},
  logger: LoggerService | false = false,
): Promise<NaviosApplication<SrvxEnvironment>> {
  class AppController {
    simple = handler({ config: { method: 'GET', url: '/simple' } } as any, () => ({ ok: true }))
    user = handler(
      { config: { method: 'GET', url: '/users/$id' } } as any,
      ({ urlParams }: any, ctx: RequestContext) => ({ id: urlParams.id, ip: ctx.ip ?? null }),
    )
    echo = handler(
      { config: { method: 'POST', url: '/echo', requestSchema: anything } } as any,
      ({ data }: any) => ({ data }),
    )
    length = handler(
      { config: { method: 'POST', url: '/length', requestSchema: anything } } as any,
      ({ data }: any) => ({ length: String(data).length }),
    )
    noBody = handler({ config: { method: 'POST', url: '/no-body' } } as any, () => ({ ok: true }))
    // Reads the body itself, past the pipeline.
    rawRead = handler(
      { config: { method: 'POST', url: '/raw-read' } } as any,
      async (_: unknown, ctx: RequestContext) => ({
        length: (await raw(ctx).request.text()).length,
      }),
    )
    runtime = handler(
      { config: { method: 'GET', url: '/runtime' } } as any,
      (_: unknown, ctx: RequestContext) => {
        const { request, server } = raw(ctx)
        return {
          name: request.runtime?.name ?? null,
          env: request.runtime?.cloudflare?.env ?? null,
          hasNode: request.runtime?.node !== undefined,
          canWait: typeof request.waitUntil === 'function',
          server: server?.runtime ?? null,
        }
      },
    )
    events = handler({ config: { method: 'GET', url: '/events', response: 'stream' } } as any, () =>
      sseStream(
        (async function* () {
          yield { data: 'one' }
          yield { data: 'two' }
        })(),
      ),
    )
  }
  registerController(AppController)
  class AppModule {}
  registerModule(AppModule, { controllers: [AppController] })
  return NaviosFactory.create(AppModule, {
    adapter: defineSrvxEnvironment(options),
    logger,
    shutdownTimeout: 3000,
  })
}
