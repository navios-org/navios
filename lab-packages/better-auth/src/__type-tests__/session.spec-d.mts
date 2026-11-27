import { describe, expectTypeOf, it } from 'vitest'

import type { RequestContext } from '@navios/server'

import { AuthSession, provideBetterAuth, requireSession } from '../index.mjs'

import type { AuthSessionData, SessionOf } from '../index.mjs'

describe('session types', () => {
  it('should type an unregistered session with the base user', () => {
    expectTypeOf<AuthSessionData['user']['email']>().toEqualTypeOf<string>()
    expectTypeOf<AuthSessionData['session']['userId']>().toEqualTypeOf<string>()
  })

  it('should read the session of a token, with additional fields', () => {
    const Auth = provideBetterAuth({
      user: { additionalFields: { plan: { type: 'string', required: true } } },
    })

    expectTypeOf<SessionOf<typeof Auth>['user']['plan']>().toEqualTypeOf<string>()
  })

  it('should give the request value and requireSession the session type', () => {
    expectTypeOf<ReturnType<AuthSession['resolve']>>().toEqualTypeOf<
      Promise<AuthSessionData | null>
    >()
    expectTypeOf(requireSession).parameter(0).toEqualTypeOf<RequestContext>()
    expectTypeOf(requireSession).returns.toEqualTypeOf<Promise<AuthSessionData>>()
  })
})
