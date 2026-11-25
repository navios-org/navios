import { registerModule } from '@navios/core'

import { NaviosFactory } from '../application/navios-factory.mjs'

import { defineApplicationTopic } from './application.mjs'
import { defineErrorsTopic } from './errors.mjs'
import { defineGuardsTopic } from './guards.mjs'
import { defineHeadersTopic } from './headers.mjs'
import { defineJsonTopic } from './json.mjs'
import { defineRequestBodiesTopic } from './request-bodies.mjs'
import { defineRequestLifecycleTopic } from './request-lifecycle.mjs'
import { defineResponseBodiesTopic } from './response-bodies.mjs'
import { defineRouteMatchingTopic } from './route-matching.mjs'
import { createSuite } from './suite.mjs'

import type { ConformanceOptions } from './conformance-options.mjs'

/**
 * The behaviour every HTTP adapter must show, exercised over real HTTP.
 * Adapter packages run it from their own test suite:
 *
 * ```ts
 * import { afterAll, beforeAll, describe, expect, it } from 'vitest'
 * import { runAdapterConformance } from '@navios/core/conformance'
 *
 * runAdapterConformance({
 *   runner: { describe, it, expect, beforeAll, afterAll },
 *   name: 'fastify',
 *   adapter: () =>
 *     defineFastifyEnvironment({
 *       bodyLimit: 65536,
 *       multipart: { limits: { fileSize: 65536 } },
 *     }),
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
    const responseBodies = defineResponseBodiesTopic(suite)
    const routeMatching = defineRouteMatchingTopic(suite)
    const requestBodies = defineRequestBodiesTopic(suite)
    const requestLifecycle = defineRequestLifecycleTopic(suite)
    const application = defineApplicationTopic(suite)

    class AppModule {}
    registerModule(AppModule, {
      controllers: [
        ...json.controllers,
        ...errors.controllers,
        ...headers.controllers,
        ...responseBodies.controllers,
        ...requestBodies.controllers,
        ...requestLifecycle.controllers,
        ...application.controllers,
        ...routeMatching.controllers,
      ],
      imports: [...guards.modules, ...routeMatching.modules],
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
      const address = await suite.app.listen(options.listenOptions)
      suite.base = address.replace(/\/$/, '').replace('[::1]', '127.0.0.1')
    })

    afterAll(async () => {
      await suite.app.close()
    })

    // Registered in a fixed order; the last test closes the application.
    json.tests()
    errors.mapping()
    guards.tests()
    headers.tests()
    responseBodies.tests()
    errors.defects()
    routeMatching.tests()
    requestBodies.tests()
    requestLifecycle.tests()
    application.tests()
  })
}
