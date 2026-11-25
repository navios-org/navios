import '../internal/this-copy.mjs'

// For tests of a transport's own contexts, without an application around them.
export { enableAsyncContext } from '../execution/async-context.mjs'
export { createContextHost } from '../execution/context-host.mjs'
export type { ContextHost } from '../execution/context-host.mjs'

export { fakeTransport } from './fake-transport.mjs'
export type { FakeTransport, FakeTransportOptions } from './fake-transport.mjs'
