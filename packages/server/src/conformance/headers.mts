import type { StandardSchemaV1 } from '@navios/core'

import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'

import type { RequestContext } from '../context/request-context.mjs'

import { s } from './schema.mjs'
import { endpoint } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Request headers and cookies, response headers and cookies.
 * @internal
 */
export function defineHeadersTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch } = suite

  class HeadersController {
    headersSchema = handler(
      endpoint({
        method: 'GET',
        url: '/headers-schema',
        headersSchema: {
          '~standard': {
            version: 1,
            vendor: 'navios-conformance',
            validate: (value: any) =>
              typeof value['x-agent'] === 'string'
                ? { value }
                : { issues: [{ message: 'Expected a string', path: ['x-agent'] }] },
          },
        } as StandardSchemaV1<unknown, Record<string, string>>,
        responseSchema: s.object({ agent: s.string(), list: s.string(), native: s.string() }),
      }),
      (args, ctx) => {
        // Not part of the handler types: builder declares no header schemas.
        const { headers } = args as unknown as { headers: Record<string, string> }
        const { 'x-agent': agent, 'x-list': list } = headers
        // What a schema passes on is the handler's own.
        headers['x-agent'] = 'changed'
        return { agent, list, native: ctx.headers.get('x-agent') ?? '' }
      },
    )

    headers = handler(
      endpoint({
        method: 'GET',
        url: '/headers',
        responseSchema: s.object({ agent: s.string(), theme: s.string() }),
      }),
      (_params: any, ctx: RequestContext) => {
        ctx.reply.header('x-custom', 'yes')
        ctx.reply.cookie('sid', 'a b', { httpOnly: true, path: '/' })
        return {
          agent: ctx.headers.get('x-agent') ?? '',
          theme: ctx.cookies.get('theme') ?? '',
        }
      },
    )
  }
  registerController(HeadersController, { attributes: [suite.Public()] })

  return {
    controllers: [HeadersController],
    tests() {
      it('validates request headers against a schema, by lower-case name', async () => {
        const response = await fetch(url('/headers-schema'), {
          headers: [
            ['X-Agent', 'conformance'],
            ['X-List', 'a'],
            ['X-List', 'b'],
          ],
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
          agent: 'conformance',
          list: 'a, b',
          native: 'conformance',
        })

        const missing = await fetch(url('/headers-schema'))
        expect(missing.status).toBe(400)
        expect((await missing.json()).source).toBe('headers')
      })

      it('reads request headers and cookies and writes response headers and cookies', async () => {
        const response = await fetch(url('/headers'), {
          headers: { 'x-agent': 'conformance', cookie: 'a=1; theme=dark' },
        })
        expect(await response.json()).toEqual({ agent: 'conformance', theme: 'dark' })
        expect(response.headers.get('x-custom')).toBe('yes')
        expect(response.headers.get('set-cookie')).toBe('sid=a%20b; Path=/; HttpOnly')
      })
    },
  }
}
