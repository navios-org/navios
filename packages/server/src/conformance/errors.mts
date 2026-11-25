import { registerController } from '../controllers/controller.mjs'
import { HttpException } from '../errors/http-exception.mjs'
import { handler } from '../handlers/handler.mjs'

import type { NaviosApplication } from '../application/navios-application.mjs'

import { s } from './schema.mjs'
import { endpoint, user } from './suite.mjs'

import type { ConformanceSuite } from './suite.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Error mapping: thrown exceptions, crashes, responses that do not match
 * their schema, unknown routes, and defects of the application's own code.
 * @internal
 */
export function defineErrorsTopic(suite: ConformanceSuite) {
  const { it, expect, url } = suite

  class BadlyMapped extends Error {}

  class ErrorsController {
    declaredError = handler(
      endpoint({
        method: 'GET',
        url: '/declared-error',
        responseSchema: user,
        errorSchema: { 404: s.object({ message: s.string() }) },
      }),
      () => {
        throw new HttpException(404, { message: 'declared body' })
      },
    )

    undeclaredError = handler(
      endpoint({ method: 'GET', url: '/undeclared-error', responseSchema: user }),
      () => {
        throw new HttpException(418, 'teapot')
      },
    )

    crash = handler(endpoint({ method: 'GET', url: '/crash', responseSchema: user }), () => {
      throw new Error('db password is hunter2')
    })

    badResponse = handler(
      endpoint({ method: 'GET', url: '/bad-response', responseSchema: user }),
      () => ({ id: 1 }) as any,
    )

    badMapper = handler(endpoint({ method: 'GET', url: '/bad-mapper' }), () => {
      throw new BadlyMapped()
    })

    unserialisable = handler(endpoint({ method: 'GET', url: '/unserialisable' }), () => ({
      count: 1n,
    }))
  }
  registerController(ErrorsController, { attributes: [suite.Public()] })

  return {
    controllers: [ErrorsController],
    configure(app: NaviosApplication<any>) {
      app.mapError(BadlyMapped, () => undefined as never)
    },
    mapping() {
      it('maps errors the same way everywhere', async () => {
        const declared = await fetch(url('/declared-error'))
        expect(declared.status).toBe(404)
        expect(await declared.json()).toEqual({ message: 'declared body' })

        const undeclared = await fetch(url('/undeclared-error'))
        expect(undeclared.status).toBe(418)
        expect(undeclared.headers.get('content-type')).toContain('application/problem+json')
        expect((await undeclared.json()).detail).toBe('teapot')

        const crash = await fetch(url('/crash'))
        expect(crash.status).toBe(500)
        const crashText = await crash.text()
        expect(crashText.includes('hunter2')).toBe(false)
        expect(JSON.parse(crashText).title).toBe('Internal Server Error')

        const badResponse = await fetch(url('/bad-response'))
        expect(badResponse.status).toBe(500)

        const missing = await fetch(url('/does-not-exist'))
        expect(missing.status).toBe(404)
        expect(missing.headers.get('content-type')).toContain('application/problem+json')
        expect((await missing.json()).title).toBe('Not Found')
      })
    },
    defects() {
      it('answers 500 problem+json for a body that cannot be serialised', async () => {
        const response = await fetch(url('/unserialisable'))
        expect(response.status).toBe(500)
        expect(response.headers.get('content-type')).toContain('application/problem+json')
        expect((await response.json()).title).toBe('Internal Server Error')
      })

      it('answers 500 problem+json when an error mapper returns nothing', async () => {
        const response = await fetch(url('/bad-mapper'))
        expect(response.status).toBe(500)
        expect(response.headers.get('content-type')).toContain('application/problem+json')
      })
    },
  }
}
