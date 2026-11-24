import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { runAdapterConformance } from '@navios/core/conformance'

import { defineBunEnvironment } from '../src/index.mjs'

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'bun',
  adapter: () => defineBunEnvironment(),
  listenOptions: { port: 0, hostname: '127.0.0.1' },
})
