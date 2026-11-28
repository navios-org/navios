import { describe, expectTypeOf, it } from 'vitest'

import type { PlainContextKey } from '@navios/server'

import { CurrentSession, CurrentUser, provideBetterAuth } from '../index.mjs'

import type { AuthSessionData, AuthSessionRecord, AuthUser, SessionOf } from '../index.mjs'

describe('session types', () => {
  it('should type an unregistered user and session with the base fields', () => {
    expectTypeOf<AuthUser['email']>().toEqualTypeOf<string>()
    expectTypeOf<AuthSessionRecord['userId']>().toEqualTypeOf<string>()
    expectTypeOf<AuthSessionData['user']>().toEqualTypeOf<AuthUser>()
  })

  it('should give the context keys the user and the session', () => {
    expectTypeOf(CurrentUser).toEqualTypeOf<PlainContextKey<AuthUser>>()
    expectTypeOf(CurrentSession).toEqualTypeOf<PlainContextKey<AuthSessionRecord>>()
  })

  it('should read the session of a token, with additional fields', () => {
    const Auth = provideBetterAuth({
      user: { additionalFields: { plan: { type: 'string', required: true } } },
    })

    expectTypeOf<SessionOf<typeof Auth>['user']['plan']>().toEqualTypeOf<string>()
  })
})
