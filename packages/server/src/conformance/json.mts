import { registerController } from '../controllers/controller.mjs'
import { handler } from '../handlers/handler.mjs'
import { reply } from '../responses/reply.mjs'

import { s } from './schema.mjs'
import { endpoint, user } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * JSON endpoints: url params, query and body validation, declared statuses.
 * @internal
 */
export function defineJsonTopic(suite: ConformanceSuite) {
  const { it, expect, url, fetch, json } = suite

  class JsonController {
    simple = handler(
      endpoint({
        method: 'GET',
        url: '/simple',
        responseSchema: s.object({ message: s.string() }),
      }),
      () => ({ message: 'ok' }),
    )

    urlParams = handler(
      endpoint({
        method: 'GET',
        url: '/items/$id/parts/$partId',
        responseSchema: s.object({ id: s.string(), partId: s.string() }),
      }),
      ({ urlParams }: any) => urlParams,
    )

    query = handler(
      endpoint({
        method: 'GET',
        url: '/search',
        querySchema: s.object({ q: s.string(), limit: s.number({ coerce: true }) }),
        responseSchema: s.object({ q: s.string(), limit: s.number() }),
      }),
      ({ params }: any) => params,
    )

    create = handler(
      endpoint({
        method: 'POST',
        url: '/users',
        requestSchema: s.object({ name: s.string({ min: 1 }) }),
        responses: { 201: user },
        errorSchema: { 409: s.object({ reason: s.string() }) },
      }),
      ({ data }: any) =>
        data.name === 'taken'
          ? reply(409, { reason: 'name is taken' })
          : reply(201, { id: '1', name: data.name, internal: 'must be stripped' }),
    )

    remove = handler(
      endpoint({ method: 'DELETE', url: '/users/$id', response: 'void' }),
      () => undefined,
    )

    noContent = handler(
      endpoint({ method: 'PUT', url: '/users/$id', responses: { 204: null } }),
      () => reply(204),
    )
  }
  registerController(JsonController, { attributes: [suite.Public()] })

  return {
    controllers: [JsonController],
    tests() {
      it('serves JSON with url params and a coerced query', async () => {
        const simple = await fetch(url('/simple'))
        expect(simple.status).toBe(200)
        expect(simple.headers.get('content-type')).toContain('application/json')
        expect(await simple.json()).toEqual({ message: 'ok' })

        const params = await fetch(url('/items/a%20b/parts/7'))
        expect(await params.json()).toEqual({ id: 'a b', partId: '7' })

        const query = await fetch(url('/search?q=hello&limit=5'))
        expect(await query.json()).toEqual({ q: 'hello', limit: 5 })
      })

      it('answers 400 problem+json for an invalid query, an invalid body and malformed JSON', async () => {
        const query = await fetch(url('/search?q=hello&limit=abc'))
        expect(query.status).toBe(400)
        expect(query.headers.get('content-type')).toContain('application/problem+json')
        expect((await query.json()).source).toBe('query')

        const body = await fetch(url('/users'), json({ name: '' }))
        expect(body.status).toBe(400)
        expect((await body.json()).source).toBe('body')

        const malformed = await fetch(url('/users'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"name": ',
        })
        expect(malformed.status).toBe(400)
        expect(malformed.headers.get('content-type')).toContain('application/problem+json')
      })

      it('uses declared statuses, strips undeclared fields and sends bodiless statuses', async () => {
        const created = await fetch(url('/users'), json({ name: 'ann' }))
        expect(created.status).toBe(201)
        expect(await created.json()).toEqual({ id: '1', name: 'ann' })

        const conflict = await fetch(url('/users'), json({ name: 'taken' }))
        expect(conflict.status).toBe(409)
        expect(await conflict.json()).toEqual({ reason: 'name is taken' })

        const removed = await fetch(url('/users/1'), { method: 'DELETE' })
        expect(removed.status).toBe(204)
        expect(await removed.text()).toBe('')

        const updated = await fetch(url('/users/1'), { method: 'PUT' })
        expect(updated.status).toBe(204)
        expect(await updated.text()).toBe('')
      })
    },
  }
}
