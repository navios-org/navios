import type { AdapterDefinition } from '../adapter/http-adapter.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The test-runner functions the suite needs. Pass Vitest's or `bun:test`'s.
 */
export interface ConformanceRunner {
  describe: (name: string, fn: () => void) => void
  it: (name: string, fn: () => Promise<void> | void) => void
  expect: (value: any) => any
  beforeAll: (fn: () => Promise<void> | void) => void
  afterAll: (fn: () => Promise<void> | void) => void
}

/** CORS for a list of origins, under the names that the options of adapters share. */
export interface ConformanceCors {
  origin: string[]
  methods: string[]
  credentials: boolean
}

export interface ConformanceOptions {
  runner: ConformanceRunner
  /** Shown in the suite title. */
  name: string
  /** Creates the adapter under test. `multipart` must be enabled. */
  adapter: () => AdapterDefinition<any>
  /**
   * Creates the adapter under test with CORS. Leave it out for an adapter
   * without CORS.
   */
  cors?: (cors: ConformanceCors) => AdapterDefinition<any>
  /**
   * Options for `app.listen()` that bind an ephemeral local port. Leave it out
   * for an adapter without a server: requests then go through `inject()`, and
   * what needs a connection is not checked.
   */
  listenOptions?: unknown
  /**
   * The largest request body, in bytes, that the adapter created by `adapter`
   * accepts: a JSON or a text body, and a file of a multipart body. Use 16 KiB
   * or more; the other cases send small bodies. When set, the suite checks
   * that a larger body is answered with a 413 problem response. Leave it out
   * for an adapter that cannot limit the size of a body.
   */
  bodyLimit?: number
}
