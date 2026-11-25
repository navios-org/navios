import { describe, expectTypeOf, it } from 'vitest'

import type { ExecutionContext } from '@navios/core'
import type { Guard as KernelGuard } from '@navios/core'
import type { Interceptor as KernelInterceptor } from '@navios/core'

import { UseGuards, UseInterceptors } from '../index.mjs'

import type { Guard, Interceptor, RequestContext, RouteResult } from '../index.mjs'

describe('guards and interceptors', () => {
  it('keeps the HTTP-typed names on the main entry', () => {
    expectTypeOf<Guard>().toEqualTypeOf<KernelGuard<RequestContext>>()
    expectTypeOf<Interceptor>().toEqualTypeOf<KernelInterceptor<RequestContext, RouteResult>>()
  })

  it('accepts HTTP and neutral classes in the decorators', () => {
    class HttpOnly implements Guard {
      canActivate(ctx: RequestContext) {
        return ctx.method === 'GET'
      }
    }
    class Neutral implements KernelGuard {
      canActivate(ctx: ExecutionContext) {
        return ctx.kind !== ''
      }
    }
    class Timing implements Interceptor {
      async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
        return next()
      }
    }
    class NeutralTiming implements KernelInterceptor {
      async intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
        return next()
      }
    }

    expectTypeOf(UseGuards).toBeCallableWith(HttpOnly, Neutral)
    expectTypeOf(UseInterceptors).toBeCallableWith(Timing, NeutralTiming)
  })
})
