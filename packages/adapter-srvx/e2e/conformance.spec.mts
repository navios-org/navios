import { runAdapterConformance } from '@navios/server/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineSrvxEnvironment } from '../src/index.mjs'

const BODY_LIMIT = 64 * 1024

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'srvx on node',
  adapter: () => defineSrvxEnvironment({ serve: { maxRequestBodySize: BODY_LIMIT } }),
  cors: (cors) => defineSrvxEnvironment({ cors }),
  listenOptions: { port: 0, hostname: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
