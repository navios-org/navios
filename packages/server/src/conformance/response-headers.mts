import { registerInjectable } from '@navios/di'

import { registerController } from '../controllers/controller.mjs'
import { HttpException } from '../errors/http-exception.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { HttpInterceptor as Interceptor } from '../routing/http-contracts.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Response headers: several values, names in any case, values that cannot be
 * sent, and what an error response keeps of them.
 * @internal
 */
export function defineResponseHeadersTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch, waitFor, events } = suite

  class CaseInterceptor implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
      const result = await next()
      return { ...result, headers: { 'Cache-Control': 'no-store', 'X-Case': 'result' } }
    }
  }
  registerInjectable(CaseInterceptor)

  class InvalidHeaderInterceptor implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
      return { ...(await next()), headers: { 'x-bad': 'a\nb' } }
    }
  }
  registerInjectable(InvalidHeaderInterceptor)

  class InvalidStatusInterceptor implements Interceptor {
    async intercept(_ctx: RequestContext, next: () => Promise<RouteResult>) {
      return { ...(await next()), status: 99 }
    }
  }
  registerInjectable(InvalidStatusInterceptor)

  const unsent = async function* () {
    try {
      yield 'a'
      yield 'b'
    } finally {
      events.push('unsent:finally')
    }
  }

  class ResponseHeadersController {
    several = handler(
      endpoint({ method: 'GET', url: '/several-headers' }),
      (_params: any, ctx: RequestContext) => {
        ctx.reply.append('set-cookie', 'a=1')
        ctx.reply.append('set-cookie', 'b=2')
        ctx.reply.cookie('c', '3')
        ctx.reply.cookie('c', '4')
        ctx.reply.header('x-list', ['one', 'two'])
        return {}
      },
    )

    caseOfNames = handler(
      endpoint({ method: 'GET', url: '/header-case' }),
      { interceptors: [CaseInterceptor] },
      (_params: any, ctx: RequestContext) => {
        ctx.reply.header('Cache-Control', 'private')
        ctx.reply.header('X-Case', 'reply')
        ctx.reply.header('Content-Type', 'application/vnd.conformance+json')
        return {}
      },
    )

    invalidHeader = handler(
      endpoint({ method: 'GET', url: '/invalid-header' }),
      (_params: any, ctx: RequestContext) => {
        ctx.reply.header('x-bad', 'a\r\nx-injected: 1')
        return {}
      },
    )

    invalidResultHeader = handler(
      endpoint({ method: 'GET', url: '/invalid-result-header' }),
      { interceptors: [InvalidHeaderInterceptor] },
      () => ({}),
    )

    invalidStreamHeader = handler(
      endpoint({ method: 'GET', url: '/invalid-stream-header', response: 'stream' }),
      { interceptors: [InvalidHeaderInterceptor] },
      unsent,
    )

    invalidStreamStatus = handler(
      endpoint({ method: 'GET', url: '/invalid-stream-status', response: 'stream' }),
      { interceptors: [InvalidStatusInterceptor] },
      unsent,
    )

    failed = handler(
      endpoint({ method: 'GET', url: '/failed-with-headers' }),
      (_params: any, ctx: RequestContext) => {
        ctx.reply.header('cache-control', 'public, max-age=31536000')
        ctx.reply.header('content-encoding', 'gzip')
        ctx.reply.header('etag', '"1"')
        ctx.reply.header('retry-after', '5')
        ctx.reply.cookie('kept', '1')
        throw new HttpException(503, 'busy')
      },
    )
  }
  registerController(ResponseHeadersController, { attributes: [suite.Public()] })

  const isProblem = async (response: Response) => {
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(response.headers.has('x-bad')).toBe(false)
    expect((await response.json()).title).toBe('Internal Server Error')
  }

  return {
    controllers: [ResponseHeadersController],
    tests() {
      it('sends every value of a header that has several', async () => {
        const { headers } = await fetch(url('/several-headers'))
        expect(headers.getSetCookie()).toEqual(['a=1', 'b=2', 'c=4; Path=/'])
        expect(headers.get('x-list')).toBe('one, two')
      })

      it('sends a header once, whatever the case of its name', async () => {
        const { headers } = await fetch(url('/header-case'))
        expect(headers.get('cache-control')).toBe('no-store')
        expect(headers.get('x-case')).toBe('result')
        expect(headers.get('content-type')).toContain('application/vnd.conformance+json')
        expect(headers.get('content-type')!.includes(',')).toBe(false)
      })

      it('answers 500 problem+json for a header value that cannot be sent', async () => {
        const response = await fetch(url('/invalid-header'))
        expect(response.headers.has('x-injected')).toBe(false)
        await isProblem(response)
        await isProblem(await fetch(url('/invalid-result-header')))
      })

      it('closes a stream whose headers or status cannot be sent', async () => {
        for (const path of ['/invalid-stream-header', '/invalid-stream-status']) {
          events.length = 0
          await isProblem(await fetch(url(path)))
          await waitFor(() => events.includes('unsent:finally'))
          expect(events).toEqual(['unsent:finally'])
        }
      })

      it('does not describe an error response with the headers of the response in its place', async () => {
        const response = await fetch(url('/failed-with-headers'))
        expect(response.status).toBe(503)
        expect((await response.json()).detail).toBe('busy')
        expect(response.headers.has('cache-control')).toBe(false)
        expect(response.headers.has('content-encoding')).toBe(false)
        expect(response.headers.has('etag')).toBe(false)
        expect(response.headers.get('retry-after')).toBe('5')
        expect(response.headers.getSetCookie()).toEqual(['kept=1; Path=/'])
      })
    },
  }
}
