import { builder } from '@navios/builder'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { getControllerMetadata, getModuleMetadata, handler, NaviosFactory } from '../index.mjs'
import {
  AttributeFactory,
  Controller,
  Endpoint,
  Injectable,
  Module,
  UseGuards,
} from '../legacy-compat/index.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

import type { Guard } from '../index.mjs'

const api = builder()
const ping = api.declareEndpoint({
  method: 'GET',
  url: '/ping',
  responseSchema: z.object({ ok: z.boolean() }),
})
const echo = api.declareEndpoint({
  method: 'GET',
  url: '/echo',
  responseSchema: z.object({ ok: z.boolean() }),
})

// Legacy decorators are plain function calls; apply them by hand so this
// test does not depend on a second compiler configuration.
describe('legacy-compat', () => {
  it('produces the same metadata and behaviour as the standard decorators', async () => {
    const Public = AttributeFactory.createAttribute(Symbol.for('legacy.Public'))
    let guardCalls = 0

    class DenyUnlessPublic implements Guard {
      canActivate(ctx: any) {
        guardCalls++
        return AttributeFactory.has(Public, ctx.route)
      }
    }
    Injectable()(DenyUnlessPublic)

    class LegacyController {
      async ping() {
        return { ok: true }
      }
      echo = handler(echo, () => ({ ok: true }))
    }
    const descriptor = Object.getOwnPropertyDescriptor(LegacyController.prototype, 'ping')!
    Endpoint(ping)(LegacyController.prototype, 'ping', descriptor as any)
    Public()(LegacyController.prototype, 'ping', descriptor)
    UseGuards(DenyUnlessPublic)(LegacyController)
    Controller()(LegacyController)

    class LegacyModule {}
    Module({ controllers: [LegacyController], prefix: 'legacy' })(LegacyModule)

    expect(getModuleMetadata(LegacyModule).entries.get('prefix')).toBe('legacy')
    expect(getControllerMetadata(LegacyController).guards).toEqual([DenyUnlessPublic])

    const app = await NaviosFactory.create(LegacyModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    const call = createTestClient(app, { prefix: '/legacy' })
    expect((await call(ping)).status).toBe(200)
    expect((await call(echo)).status).toBe(403)
    expect(guardCalls).toBe(2)
    await app.close()
  })
})
