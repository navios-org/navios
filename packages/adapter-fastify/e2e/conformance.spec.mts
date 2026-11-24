import { runAdapterConformance } from '@navios/core/conformance'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineFastifyEnvironment } from '../src/index.mjs'

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'fastify',
  adapter: () => defineFastifyEnvironment({ multipart: true }),
  listenOptions: { port: 0, host: '127.0.0.1' },
})
