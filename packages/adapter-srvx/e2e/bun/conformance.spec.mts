import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { runAdapterConformance } from '@navios/server/conformance'

import { defineSrvxEnvironment } from '../../src/index.mjs'

const BODY_LIMIT = 64 * 1024

// The suite of `../conformance.spec.mts`, with the server that srvx makes of `Bun.serve`.
runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'srvx on bun',
  adapter: () => defineSrvxEnvironment({ serve: { maxRequestBodySize: BODY_LIMIT } }),
  cors: (cors) => defineSrvxEnvironment({ cors }),
  listenOptions: { port: 0, hostname: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
