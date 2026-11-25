import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { HttpException, NotFoundException, problem } from '../errors/index.mjs'
import { statusTitle } from '../errors/status-title.mjs'
import { reply } from '../responses/index.mjs'

import type { RequestContext } from '../context/index.mjs'
import type { ErrorResponder } from '../errors/index.mjs'

import { input, setup } from './pipeline-setup.mjs'

import type { SetupOptions } from './pipeline-setup.mjs'

const fails = (error: unknown) => () => {
  throw error
}

describe('an error responder', () => {
  it('may answer with a reply()', () => {
    const { execute } = setup({}, () => 'never', {
      guards: [{ canActivate: () => false }],
      responders: { forbidden: { getResponse: () => reply(403, { reason: 'no' }) } },
    })
    expect(execute(input())).toMatchObject({ status: 403, body: { reason: 'no' } })
  })

  for (const [name, broken] of [
    ['returns nothing', { getResponse: () => undefined as never }],
    ['throws', { getResponse: fails(new Error('responder down')) }],
    ['answers with something that cannot be sent', { getResponse: () => reply(99) }],
  ] as Array<[string, ErrorResponder]>) {
    it(`that ${name} is reported once, and the request is released`, async () => {
      const released = vi.fn()
      for (const [responder, status, run] of [
        ['forbidden', 403, { guards: [{ canActivate: () => false }] }],
        ['validation', 400, {}],
      ] as Array<['forbidden' | 'validation', number, SetupOptions]>) {
        released.mockClear()
        const { execute, unhandled } = setup(
          { querySchema: responder === 'validation' ? z.object({ a: z.string() }) : undefined },
          () => 'never',
          {
            outer: [
              {
                intercept(ctx: RequestContext, next) {
                  ctx.onFinish(released)
                  return next()
                },
              },
            ],
            ...run,
            responders: { [responder]: broken },
          },
        )
        const answer = await execute(input())
        expect(answer.status).toBe(name.startsWith('answers') ? 500 : status)
        expect(answer.headers['content-type']).toBe('application/problem+json')
        expect(unhandled).toHaveLength(1)
        await answer.release!()
        expect(released).toHaveBeenCalledTimes(1)
      }
    })
  }

  it('for unexpected errors may be broken as well', () => {
    for (const getResponse of [() => undefined as never, () => reply(99)]) {
      const error = new Error('boom')
      const { execute, unhandled } = setup({}, fails(error), {
        responders: { internal: { getResponse } },
      })
      expect(execute(input())).toMatchObject({ status: 500, body: { status: 500 } })
      expect(unhandled[0]).toBe(error)
    }
  })
})

describe('an error mapper', () => {
  it('that answers with 500 or above does not hide the error from the log', async () => {
    const error = new TypeError('defect')
    const { execute, errors, unhandled } = setup({}, fails(error))
    errors.add(Error, () => reply(500, { oops: true }))
    expect(execute(input())).toMatchObject({ status: 500, body: { oops: true } })
    expect(unhandled).toEqual([error])

    errors.add(Error, async () => problem(503))
    expect((await execute(input())).status).toBe(503)
    expect(unhandled).toEqual([error, error])

    errors.add(Error, () => reply(409, {}))
    execute(input())
    expect(unhandled).toHaveLength(2)
  })

  it('that answers with what cannot be sent is a defect', () => {
    class Mapped extends Error {}
    for (const answer of [
      reply(99),
      { status: 200, headers: { 'x-a': 'a\nb' }, body: {}, kind: 'json' },
      { status: 200, cookies: [{ name: 'a b', value: '' }], body: {}, kind: 'json' },
      { status: 200, body: 1n, kind: 'json' },
      { status: 200, body: {}, kind: 'other' },
    ]) {
      const { execute, errors, unhandled } = setup({}, fails(new Mapped()))
      errors.add(Mapped, () => answer)
      expect(execute(input())).toMatchObject({ status: 500, body: { status: 500 } })
      expect(unhandled).toHaveLength(1)
    }
  })
})

describe('an HttpException with a status the endpoint declares', () => {
  const errorSchema = { 404: z.object({ message: z.string() }) }

  it('is answered with what the schema makes of its body', () => {
    for (const environment of ['production', 'development']) {
      vi.stubEnv('NODE_ENV', environment)
      const { execute, unhandled } = setup(
        { errorSchema },
        fails(new HttpException(404, { message: 'm', passwordHash: 'secret' })),
      )
      expect(execute(input())).toMatchObject({ status: 404, body: { message: 'm' } })
      expect((execute(input()) as { sent: string }).sent).toBe('{"message":"m"}')
      expect(unhandled).toEqual([])
    }
    vi.unstubAllEnvs()
  })

  it('keeps its status when its body does not match, without the fields it was thrown with', () => {
    const { execute, unhandled } = setup(
      { errorSchema },
      fails(new HttpException(404, { msg: 'secret' })),
    )
    expect(execute(input())).toMatchObject({
      status: 404,
      headers: { 'content-type': 'application/problem+json' },
      body: { type: 'about:blank', title: 'Not Found', status: 404 },
    })
    expect((execute(input()) as { sent: string }).sent).not.toContain('secret')
    expect(String(unhandled[0])).toContain(
      'GET /test threw an HttpException(404) whose body does not match',
    )
  })

  it('waits for an asynchronous schema', async () => {
    const asynchronous = {
      404: z.object({ message: z.string().refine(async (value) => value === 'ok') }),
    }
    const valid = setup(
      { errorSchema: asynchronous },
      fails(new HttpException(404, { message: 'ok', x: 1 })),
    )
    expect(await valid.execute(input())).toMatchObject({ status: 404, sent: '{"message":"ok"}' })
    const invalid = setup(
      { errorSchema: asynchronous },
      fails(new HttpException(404, { message: 'x' })),
    )
    expect(await invalid.execute(input())).toMatchObject({
      status: 404,
      body: { title: 'Not Found' },
    })
    expect(invalid.unhandled).toHaveLength(1)
  })
})

describe('an error outside a route', () => {
  it('is reported with the request it belongs to', () => {
    const reported: unknown[] = []
    const { errors } = setup({}, () => ({}), {
      responders: { onUnhandled: (_error, at) => reported.push(at) },
    })
    const at = { method: 'GET', path: '/hook' }
    const result = errors.toResult(new HttpException(503, { retry: true }), null, null, at)
    expect(result).toMatchObject({ status: 503, body: { retry: true } })
    errors.toResult(new Error('boom'), null, null, at)
    errors.toResult(new HttpException(403, 'no'), null, null, at)
    errors.toResult(new Error('boom'), null, null)
    expect(reported).toEqual([at, at, null])
  })
})

describe('HttpException', () => {
  it('has the status of an error', () => {
    for (const status of [0, 200, 204, 304, 399, 600, 999, 404.5, Number.NaN]) {
      expect(() => new HttpException(status, 'x')).toThrow(/cannot have the status/)
    }
    expect(new HttpException(400, 'x').statusCode).toBe(400)
    expect(new HttpException(599, 'x').statusCode).toBe(599)
  })

  it('has a text or fields for a response', () => {
    expect(() => new HttpException(400, [{ a: 1 }])).toThrow(/not an array/)
    expect(() => new HttpException(400, new Error('cause'))).toThrow(/its cause/)
    expect(() => new NotFoundException(['a'])).toThrow(/not an array/)
  })
})

describe('statusTitle', () => {
  it('knows every registered error status', () => {
    const registered = [
      400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421,
      422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 511,
    ]
    for (const status of registered) {
      expect(statusTitle(status)).not.toMatch(/^(?:Server )?Error$/)
    }
    expect(statusTitle(402)).toBe('Payment Required')
    expect(statusTitle(451)).toBe('Unavailable For Legal Reasons')
    expect(statusTitle(499)).toBe('Error')
    expect(statusTitle(599)).toBe('Server Error')
  })
})

describe('a handler that fails because the client has gone', () => {
  const run = async (error: unknown, isGone = true) => {
    const controller = new AbortController()
    const { execute, unhandled, errors } = setup({}, async (_params, ctx: RequestContext) => {
      void ctx.signal
      if (isGone) {
        controller.abort()
      }
      throw error
    })
    errors.add(RangeError, () => reply(503))
    const answer = await execute(input({ signal: () => controller.signal }))
    return { status: answer.status, unhandled }
  }
  const aborted = new DOMException('This operation was aborted', 'AbortError')

  it('is not reported', async () => {
    const axios = Object.assign(new Error('canceled'), { name: 'CanceledError' })
    for (const error of [
      aborted,
      axios,
      new Error('query failed', { cause: new Error('fetch failed', { cause: aborted }) }),
      new RangeError('mapped', { cause: aborted }),
    ]) {
      expect((await run(error)).unhandled).toEqual([])
    }
  })

  it('is reported when it fails with something else, or when the client is there', async () => {
    const bug = new TypeError('x is not a function')
    expect((await run(bug)).unhandled).toEqual([bug])
    expect((await run(aborted, false)).unhandled).toEqual([aborted])
    const loop: Error = new Error('loop')
    loop.cause = loop
    expect((await run(loop)).unhandled).toEqual([loop])
  })
})
