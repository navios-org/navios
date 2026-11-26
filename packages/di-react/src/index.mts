// Container access
export {
  ContainerContext,
  ContainerProvider,
  ScopedContainerContext,
  useContainer,
  useRootContainer,
} from './container/index.mjs'
export type { ContainerProviderProps } from './container/index.mjs'

// Request scopes
export {
  ScopeProvider,
  useScope,
  useScopeMetadata,
  useScopeOrThrow,
  useScopedContainer,
  useScopedContainerOrThrow,
} from './scope/index.mjs'
export type { ScopeProviderProps } from './scope/index.mjs'

// Service resolution
export {
  useInvalidateInstance,
  useOptionalService,
  useService,
  useSuspenseService,
} from './service/index.mjs'
export type { UseOptionalServiceResult, UseServiceResult } from './service/index.mjs'
