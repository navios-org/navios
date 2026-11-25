import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { runAdapterConformance } from '@navios/server/conformance'

import { defineBunEnvironment } from '../src/index.mjs'

const BODY_LIMIT = 64 * 1024

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'bun',
  adapter: () => defineBunEnvironment({ serve: { maxRequestBodySize: BODY_LIMIT } }),
  cors: (cors) => defineBunEnvironment({ cors }),
  listenOptions: { port: 0, hostname: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
