import { registerInjectable } from '@navios/di'

import { registerModule } from '../application/http-module-options.mjs'
import { AttributeFactory } from '../attributes/attribute-factory.mjs'
import { registerRequestValue } from '../context/request-value.mjs'
import { registerController } from '../controllers/controller.mjs'
import { UnauthorizedException } from '../errors/http-exception.mjs'
import { createContextKey } from '../execution/context-key.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Guards, the values they put into the context, and request values.
 * @internal
 */
export function defineGuardsTopic(suite: ConformanceSuite) {
  const { it, expect, url, json, waitFor, events, Public } = suite

  const CurrentUser = createContextKey<{ name: string }>('CurrentUser')

  class Session {
    resolve(ctx: RequestContext) {
      events.push('session:resolve')
      const header = ctx.headers.get('authorization')
      return header ? { name: header.replace('Bearer ', '') } : null
    }
    dispose() {
      events.push('session:dispose')
    }
  }
  registerRequestValue(Session)

  class AuthGuard implements Guard {
    canActivate(ctx: RequestContext) {
      if (AttributeFactory.has(Public, ctx.route)) {
        return true
      }
      const session = ctx.get(Session)
      if (!session) {
        throw new UnauthorizedException('Missing authorization header')
      }
      ctx.set(CurrentUser, session)
      return true
    }
  }
  registerInjectable(AuthGuard)

  class PrivateController {
    me = handler(
      endpoint({ method: 'GET', url: '/me', responseSchema: s.object({ name: s.string() }) }),
      (_params: any, ctx: RequestContext) => ({ name: ctx.get(CurrentUser).name }),
    )

    guarded = handler(
      endpoint({
        method: 'POST',
        url: '/guarded',
        requestSchema: s.object({ name: s.string() }),
        responseSchema: s.object({ name: s.string() }),
      }),
      ({ data }: any) => data,
    )
  }
  registerController(PrivateController)

  class PrivateModule {}
  registerModule(PrivateModule, { controllers: [PrivateController], guards: [AuthGuard] })

  return {
    modules: [PrivateModule],
    tests() {
      it('runs guards before the body is validated', async () => {
        const anonymous = await fetch(url('/guarded'), json({ name: 123 }))
        expect(anonymous.status).toBe(401)
        expect((await anonymous.json()).detail).toBe('Missing authorization header')

        const invalid = await fetch(
          url('/guarded'),
          json({ name: 123 }, { authorization: 'Bearer ann' }),
        )
        expect(invalid.status).toBe(400)

        const valid = await fetch(
          url('/guarded'),
          json({ name: 'x' }, { authorization: 'Bearer ann' }),
        )
        expect(await valid.json()).toEqual({ name: 'x' })
      })

      it('carries a guard value to the handler and computes request values lazily', async () => {
        events.length = 0
        await fetch(url('/simple'))
        expect(events).toEqual([])

        const me = await fetch(url('/me'), { headers: { authorization: 'Bearer ann' } })
        expect(await me.json()).toEqual({ name: 'ann' })
        await waitFor(() => events.includes('session:dispose'))
        expect(events).toEqual(['session:resolve', 'session:dispose'])
      })
    },
  }
}
