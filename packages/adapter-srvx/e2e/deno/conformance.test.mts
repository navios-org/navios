import { after, before, describe, it } from 'node:test'

import { runAdapterConformance } from '@navios/server/conformance'
import { expect } from 'vitest'

import { defineSrvxEnvironment } from '../../src/index.mjs'

const BODY_LIMIT = 64 * 1024

// The client of Deno sends a `Blob` without bytes with chunked transfer
// encoding, where that of Node and of Bun declares a length of 0: a body to
// the server, which the suite means to be none.
const send = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  send(
    input,
    init?.body instanceof Blob && init.body.size === 0 ? { ...init, body: new Uint8Array() } : init,
  )) as typeof fetch

// The suite of `../conformance.spec.mts`, with the server that srvx makes of
// `Deno.serve`. Run with `deno test`, which has the test runner of Node.
runAdapterConformance({
  runner: { describe, it, expect, beforeAll: before, afterAll: after },
  name: 'srvx on deno',
  adapter: () => defineSrvxEnvironment({ serve: { maxRequestBodySize: BODY_LIMIT } }),
  cors: (cors) => defineSrvxEnvironment({ cors }),
  listenOptions: { port: 0, hostname: '127.0.0.1' },
  bodyLimit: BODY_LIMIT,
})
