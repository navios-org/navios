// Adds the HTTP options to `@Module` for a program that imports only this entry.
import '../application/http-module-options.mjs'

export { defineInMemoryEnvironment } from './in-memory-adapter.mjs'
export type { InMemoryEnvironment } from './in-memory-adapter.mjs'
export { createTestClient } from './test-client.mjs'
export type { TestClient, TestClientOptions } from './test-client.mjs'
