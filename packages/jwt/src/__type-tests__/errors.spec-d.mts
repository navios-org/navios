import { describe, expectTypeOf, it } from 'vitest'

import { JsonWebTokenError, JwtService, NotBeforeError, TokenExpiredError } from '../index.mjs'

describe('error classes', () => {
  it('should be usable as types as well as values', () => {
    const expired: TokenExpiredError = new TokenExpiredError('jwt expired', new Date())
    const notBefore: NotBeforeError = new NotBeforeError('jwt not active', new Date())
    const invalid: JsonWebTokenError = new JsonWebTokenError('invalid token')

    expectTypeOf(expired.expiredAt).toEqualTypeOf<Date>()
    expectTypeOf(notBefore.date).toEqualTypeOf<Date>()
    expectTypeOf(invalid).toExtend<Error>()
    expectTypeOf(expired).toExtend<JsonWebTokenError>()
  })

  it('should narrow with instanceof', () => {
    const error: unknown = new Error('x')
    if (error instanceof TokenExpiredError) {
      expectTypeOf(error).toEqualTypeOf<TokenExpiredError>()
    }
  })
})

describe('JwtService.decode', () => {
  it('should include null in the return type', () => {
    const service = new JwtService({ secret: 's' })

    expectTypeOf(service.decode<{ sub: string }>('token')).toEqualTypeOf<{ sub: string } | null>()
  })
})
