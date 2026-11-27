import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { handler, NaviosFactory, registerController, registerModule } from '@navios/server'
import { afterEach, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/server'

import { defineFastifyEnvironment } from '../src/index.mjs'

import type { FastifyAdapterOptions, FastifyEnvironment } from '../src/index.mjs'

describe('fastify adapter: where it listens', () => {
  let app: NaviosApplication<FastifyEnvironment>

  const create = async (options: FastifyAdapterOptions) => {
    class SimpleController {
      simple = handler({ config: { method: 'GET', url: '/simple' } } as never, () => ({ ok: true }))
    }
    registerController(SimpleController)
    class AppModule {}
    registerModule(AppModule, { controllers: [SimpleController] })
    app = await NaviosFactory.create(AppModule, {
      adapter: defineFastifyEnvironment(options),
      logger: false,
    })
  }

  afterEach(async () => {
    await app.close()
  })

  it('takes the options of an https server', async () => {
    await create({ https: { minVersion: 'TLSv1.3' } })
    await app.init()
    expect(app.getServer().server).toBeInstanceOf(https.Server)
  })

  it('needs a port or a path', async () => {
    await create({})
    await expect(app.listen({ host: '127.0.0.1' })).rejects.toThrow(/"port" or "path"/)
    expect(await app.listen({ port: 0, host: '127.0.0.1' })).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('listens on a unix socket', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'navios-'))
    try {
      await create({ https: null })
      const socketPath = join(directory, 's')
      expect(await app.listen({ path: socketPath })).toContain(socketPath)
      const status = await new Promise((resolve, reject) => {
        http
          .get({ socketPath, path: '/simple' }, (response) => {
            response.resume()
            resolve(response.statusCode)
          })
          .on('error', reject)
      })
      expect(status).toBe(200)
      await app.close()
    } finally {
      rmSync(directory, { recursive: true })
    }
  })
})

// An option that is not supported does not compile.
// @ts-expect-error -- http2
defineFastifyEnvironment({ http2: true })
