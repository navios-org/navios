import { runAdapterConformance } from '@navios/server/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineFastifyEnvironment } from '../src/index.mjs'

const BODY_LIMIT = 64 * 1024

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'fastify',
  adapter: () =>
    defineFastifyEnvironment({
      bodyLimit: BODY_LIMIT,
      multipart: { limits: { fileSize: BODY_LIMIT } },
    }),
  listenOptions: { port: 0, host: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
