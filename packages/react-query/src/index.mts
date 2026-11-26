export {
  createKeyBuilder,
  createMutationKey,
  getHttpClient,
  normalizeKeyValue,
  pickInputs,
  setHttpClient,
} from './endpoint/index.mjs'
export { makeInfiniteQuery, makeQuery } from './query/index.mjs'
export { makeMutation, optimisticUpdate } from './mutation/index.mjs'
export { declareClient } from './client/index.mjs'

export type {
  ArgsWith,
  DataWithResponse,
  EndpointArgs,
  EndpointData,
  EndpointFailure,
  EndpointInputs,
  KeyOptions,
  MaybeWithResponse,
  PartialEndpointInputs,
  RequiredKeys,
  SurfaceOptions,
} from './endpoint/index.mjs'
export type {
  AnyQueryObject,
  InfiniteEndpointOptions,
  InfiniteQueryDefaults,
  InfiniteQueryHookOptions,
  InfiniteQueryObject,
  InfiniteQueryOptionsResult,
  InfiniteQuerySettings,
  InvalidateFilters,
  PageParam,
  QueryDefaults,
  QueryHookOptions,
  QueryObject,
  QueryOptionsResult,
  QuerySettings,
  SuspenseInfiniteQueryHookOptions,
  SuspenseQueryHookOptions,
  TaggedKey,
} from './query/index.mjs'
export type {
  InvalidateTarget,
  MutationCallbackContext,
  MutationObject,
  MutationSettings,
  MutationVariables,
  OptimisticUpdate,
  OptimisticUpdateSpec,
  OptimisticUpdater,
} from './mutation/index.mjs'
export type { ClientInstance, ClientOptions } from './client/index.mjs'
