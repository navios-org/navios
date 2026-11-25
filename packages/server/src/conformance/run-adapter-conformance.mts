import { registerModule } from '@navios/core'

import { NaviosFactory } from '../application/navios-factory.mjs'

import { defineApplicationTopic } from './application.mjs'
import { defineCorsTopic } from './cors.mjs'
import { defineErrorsTopic } from './errors.mjs'
import { defineGuardsTopic } from './guards.mjs'
import { defineHeadersTopic } from './headers.mjs'
import { defineJsonTopic } from './json.mjs'
import { defineMethodsTopic } from './methods.mjs'
import { defineRequestBodiesTopic } from './request-bodies.mjs'
import { defineRequestDecodingTopic } from './request-decoding.mjs'
import { defineRequestLifecycleTopic } from './request-lifecycle.mjs'
import { defineRequestPathTopic } from './request-path.mjs'
import { defineResponseBodiesTopic } from './response-bodies.mjs'
import { defineResponseHeadersTopic } from './response-headers.mjs'
import { defineRouteMatchingTopic } from './route-matching.mjs'
import { defineShutdownTopic } from './shutdown.mjs'
import { defineStreamLifecycleTopic } from './stream-lifecycle.mjs'
import { createSuite } from './suite.mjs'

import type { ConformanceOptions } from './conformance-options.mjs'

/**
 * The behaviour every HTTP adapter must show, exercised over real HTTP, or
 * with `inject()` for an adapter without a server. Adapter packages run it
 * from their own test suite:
 *
 * ```ts
 * import { afterAll, beforeAll, describe, expect, it } from 'vitest'
 * import { runAdapterConformance } from '@navios/server/conformance'
 *
 * runAdapterConformance({
 *   runner: { describe, it, expect, beforeAll, afterAll },
 *   name: 'fastify',
 *   adapter: () =>
 *     defineFastifyEnvironment({
 *       bodyLimit: 65536,
 *       multipart: { limits: { fileSize: 65536 } },
 *     }),
 *   cors: (cors) => defineFastifyEnvironment({ cors }),
 *   listenOptions: { port: 0, host: '127.0.0.1' },
 *   bodyLimit: 65536,
 * })
 * ```
 */
export function runAdapterConformance(options: ConformanceOptions): void {
  const { describe, beforeAll, afterAll } = options.runner

  describe(`adapter conformance: ${options.name}`, () => {
    const suite = createSuite(options)

    const json = defineJsonTopic(suite)
    const errors = defineErrorsTopic(suite)
    const guards = defineGuardsTopic(suite)
    const headers = defineHeadersTopic(suite)
    const responseHeaders = defineResponseHeadersTopic(suite)
    const responseBodies = defineResponseBodiesTopic(suite)
    const routeMatching = defineRouteMatchingTopic(suite)
    const methods = defineMethodsTopic(suite)
    const requestPath = defineRequestPathTopic(suite)
    const requestBodies = defineRequestBodiesTopic(suite)
    const requestDecoding = defineRequestDecodingTopic(suite)
    const requestLifecycle = defineRequestLifecycleTopic(suite)
    const streamLifecycle = defineStreamLifecycleTopic(suite)
    const cors = defineCorsTopic(suite)
    const shutdown = defineShutdownTopic(suite)
    const application = defineApplicationTopic(suite)

    class AppModule {}
    registerModule(AppModule, {
      controllers: [
        ...json.controllers,
        ...errors.controllers,
        ...headers.controllers,
        ...responseHeaders.controllers,
        ...responseBodies.controllers,
        ...requestBodies.controllers,
        ...requestLifecycle.controllers,
        ...streamLifecycle.controllers,
        ...application.controllers,
        ...routeMatching.controllers,
        ...methods.controllers,
        ...requestPath.controllers,
      ],
      imports: [
        ...guards.modules,
        ...routeMatching.modules,
        ...requestPath.modules,
        ...requestDecoding.modules,
      ],
      prefix: '/api',
    })

    beforeAll(async () => {
      suite.app = await NaviosFactory.create(AppModule, {
        adapter: options.adapter(),
        logger: false,
        requestScopedServices: 'allow',
        shutdownTimeout: 2000,
      })
      errors.configure(suite.app)
      if (!suite.isServed) {
        return
      }
      suite.base = suite.local(await suite.app.listen(options.listenOptions))
    })

    afterAll(async () => {
      await suite.app.close()
    })

    // Registered in a fixed order; the last test closes the application.
    json.tests()
    errors.mapping()
    guards.tests()
    headers.tests()
    responseHeaders.tests()
    responseBodies.tests()
    errors.defects()
    routeMatching.tests()
    methods.tests()
    requestPath.tests()
    requestBodies.tests()
    requestDecoding.tests()
    if (suite.isServed) {
      requestLifecycle.tests()
      streamLifecycle.tests()
      if (options.cors !== undefined) {
        cors.tests()
      }
      shutdown.tests()
    }
    application.tests()
  })
}
