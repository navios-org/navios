import { describe, expectTypeOf, it } from 'vitest'

import type { ExecutionContext } from '@navios/core'
import type { Guard as KernelGuard } from '@navios/core'
import type { Interceptor as KernelInterceptor } from '@navios/core'

import {
  Controller,
  handler,
  NaviosFactory,
  problem,
  registerRequestValue,
  reply,
  RequestValue,
  UseGuards,
  UseInterceptors,
} from '../index.mjs'

import type {
  Guard,
  HttpTransport,
  Interceptor,
  NaviosApplication,
  NaviosApplicationOptions,
  RequestContext,
  RouteResult,
} from '../index.mjs'

describe('guards and interceptors', () => {
  it('keeps the HTTP-typed names on the main entry', () => {
    expectTypeOf<Guard>().toEqualTypeOf<KernelGuard<RequestContext>>()
    expectTypeOf<KernelInterceptor<RequestContext, RouteResult>>().toExtend<Interceptor>()
    expectTypeOf<Interceptor>().toExtend<KernelInterceptor<RequestContext, unknown>>()
  })

  it('lets an interceptor answer with a result, a reply() or a problem()', () => {
    class Cache implements Interceptor {
      async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
        if (ctx.method === 'PUT') {
          return reply(409, { message: 'locked' })
        }
        return ctx.method === 'GET' ? reply(304) : next()
      }
    }
    class Refuse implements Interceptor {
      intercept(ctx: RequestContext) {
        return ctx.method === 'GET' ? problem(503) : reply(503)
      }
    }
    class Wrong implements Interceptor {
      // @ts-expect-error not a response
      async intercept() {
        return { message: 'locked' }
      }
    }
    expectTypeOf(UseInterceptors).toBeCallableWith(Cache, Refuse, Wrong)
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

describe('guards and interceptors as options', () => {
  class AllowGuard implements Guard {
    canActivate(_ctx: RequestContext) {
      return true
    }
  }
  class NeutralGuard implements KernelGuard {
    canActivate(_ctx: ExecutionContext) {
      return true
    }
  }
  class NotAGuard {
    allow() {
      return true
    }
  }
  const ping = { config: { method: 'GET', url: '/ping' } } as const

  it('are checked like those of the decorators', () => {
    Controller({ guards: [AllowGuard, NeutralGuard] })
    // @ts-expect-error
    Controller({ guards: [NotAGuard] })
    // @ts-expect-error
    Controller({ interceptors: [AllowGuard] })

    handler(ping, { guards: [AllowGuard, NeutralGuard] }, () => ({}))
    // @ts-expect-error
    handler(ping, { guards: [NotAGuard] }, () => ({}))
    // @ts-expect-error
    handler(ping, { interceptors: [NotAGuard] }, () => ({}))

    const options = {} as NaviosApplicationOptions
    void NaviosFactory.create(class {}, { ...options, guards: [AllowGuard] })
    // @ts-expect-error
    void NaviosFactory.create(class {}, { ...options, guards: [NotAGuard] })
  })

  it('are checked by intercept() of the application and of the transport', () => {
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
    const app = {} as NaviosApplication
    const transport = {} as HttpTransport
    const calls = () => {
      app.intercept(Timing).intercept(NeutralTiming)
      transport.intercept(Timing)
      transport.intercept(NeutralTiming)
      // @ts-expect-error
      app.intercept(NotAGuard)
      // @ts-expect-error
      app.intercept(AllowGuard)
      // @ts-expect-error
      transport.intercept(NotAGuard)
    }
    void calls
  })

  it('does not validate responses in one environment only', () => {
    expectTypeOf<NaviosApplicationOptions['validateResponses']>().toEqualTypeOf<
      'always' | 'never' | undefined
    >()
  })
})

describe('request values', () => {
  it('dispose what they compute', () => {
    @RequestValue()
    class Session {
      async resolve(_ctx: RequestContext) {
        return { user: 'ann' }
      }
      async dispose(_session: { user: string }, _ctx: RequestContext) {}
    }
    expectTypeOf(registerRequestValue(Session)).toEqualTypeOf<typeof Session>()

    @RequestValue()
    class WithoutDispose {
      resolve() {
        return 1
      }
    }
    void WithoutDispose

    // @ts-expect-error
    @RequestValue()
    class Wrong {
      resolve() {
        return { user: 'ann' }
      }
      dispose(_session: string) {}
    }
    void Wrong

    registerRequestValue(
      // @ts-expect-error
      class {
        async resolve() {
          return 1
        }
        dispose(_value: Promise<number>) {}
      },
    )
  })
})

describe('RequestContext', () => {
  it('gives the address, the url and the bytes of a request', () => {
    expectTypeOf<RequestContext['ip']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<RequestContext['url']>().toEqualTypeOf<URL>()
    expectTypeOf<RequestContext['rawBody']>().returns.resolves.toEqualTypeOf<Uint8Array>()
  })
})
