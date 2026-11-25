// Everything of `@navios/core`, then HTTP on top of it. The side-effect import
// adds the HTTP options to `@Module`.
import './application/http-module-options.mjs'

export * from '@navios/core'
// Kept on the main entry for code written against it; new code takes the
// module graph from `@navios/core/transport`.
export { buildModuleGraph } from '@navios/core/transport'
export type {
  ContextHost,
  HandlerExtras,
  MethodHandlerMetadata,
  ModuleNode,
} from '@navios/core/transport'

export * from './adapter/index.mjs'
export * from './application/index.mjs'
export * from './context/index.mjs'
export * from './controllers/index.mjs'
export * from './errors/index.mjs'
export * from './handlers/index.mjs'
export * from './pipeline/index.mjs'
export * from './responses/index.mjs'
export * from './routing/index.mjs'
export * from './sse/index.mjs'

// HTTP-typed versions of names `@navios/core` also exports. An explicit
// export takes precedence over `export *`.
export { currentContext } from './context/current-request-context.mjs'
export type { ContextKey } from './context/http-context-key.mjs'
export type {
  HttpGuard as Guard,
  HttpInterceptor as Interceptor,
} from './routing/http-contracts.mjs'
