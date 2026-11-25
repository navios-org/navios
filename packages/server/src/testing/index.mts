// Adds the HTTP options to `@Module` for a program that imports only this entry.
import '../application/http-module-options.mjs'

export { defineInMemoryEnvironment, InMemoryAdapter } from './in-memory-adapter.mjs'
export type { InMemoryEnvironment } from './in-memory-adapter.mjs'
export { createTestClient } from './test-client.mjs'
export type { Injectable_, TestClient, TestClientOptions } from './test-client.mjs'
