import type {
  BaseEndpointOptions,
  EndpointHandler,
  ErrorSchemaRecord,
  NoUnknownOptions,
  RequireResponseSchema,
  WithBuilderErrors,
} from '@navios/builder'

import type { MaybeWithResponse } from '../endpoint/create-caller.mjs'
import type { KeyBy } from '../endpoint/key-by.mjs'
import type { EndpointData, EndpointFailure } from '../endpoint/types.mjs'
import type {
  MutationObject,
  MutationSettings,
  MutationVariables,
} from '../mutation/mutation-object.mjs'
import type {
  InfiniteEndpointOptions,
  InfiniteQueryObject,
  InfiniteQuerySettings,
} from '../query/infinite-query-object.mjs'
import type { QueryObject, QuerySettings } from '../query/query-object.mjs'

/**
 * An inline endpoint declaration plus surface-specific fields.
 *
 * `Options` is inferred through the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps the surface fields
 * (`keyPrefix`, `getNextPageParam`, mutation callbacks, ...) out of `Options`.
 */
type Inline<Options, Surface> = {
  [K in keyof Options]: Options[K]
} & RequireResponseSchema<Options> &
  Surface &
  NoUnknownOptions<Options, BaseEndpointOptions & Surface>

type MutationSettingsFor<
  Options extends BaseEndpointOptions,
  TOnMutateResult,
  TContext,
  WithResponse extends boolean,
> = MutationSettings<
  Options,
  TOnMutateResult,
  TContext,
  MaybeWithResponse<EndpointData<Options>, WithResponse>,
  EndpointFailure<Options>,
  MutationVariables<Options>,
  WithResponse
>

type QuerySettingsFor<
  Options extends BaseEndpointOptions,
  WithResponse extends boolean,
  TKeyBy,
> = QuerySettings<
  MaybeWithResponse<EndpointData<Options>, WithResponse>,
  EndpointFailure<Options>,
  WithResponse,
  TKeyBy
>

/**
 * The client returned by `declareClient`.
 *
 * Each method accepts either an inline endpoint declaration or an endpoint
 * already declared with `api.declareEndpoint`.
 *
 * @template Errors - The shared error schemas of the client's builder, which
 *   inline declarations get as well
 */
export interface ClientInstance<Errors extends ErrorSchemaRecord = {}> {
  /**
   * Creates a query.
   *
   * @example
   * ```ts
   * const getUser = client.query({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   * })
   * // or, from an existing endpoint
   * const getUser = client.query(getUserEndpoint)
   *
   * const { data, error } = getUser.use({ urlParams: { userId } })
   * ```
   */
  query<
    const Options extends BaseEndpointOptions,
    const WithResponse extends boolean = false,
    const TKeyBy extends KeyBy<Options> | undefined = undefined,
  >(
    input: Inline<
      Options,
      QuerySettingsFor<WithBuilderErrors<Options, Errors>, WithResponse, TKeyBy>
    >,
  ): QueryObject<
    WithBuilderErrors<Options, Errors>,
    MaybeWithResponse<EndpointData<Options>, WithResponse>,
    EndpointFailure<WithBuilderErrors<Options, Errors>>,
    TKeyBy
  >
  query<
    const Options extends BaseEndpointOptions,
    const WithResponse extends boolean = false,
    const TKeyBy extends KeyBy<Options> | undefined = undefined,
  >(
    endpoint: EndpointHandler<Options>,
    options?: QuerySettingsFor<Options, WithResponse, TKeyBy>,
  ): QueryObject<
    Options,
    MaybeWithResponse<EndpointData<Options>, WithResponse>,
    EndpointFailure<Options>,
    TKeyBy
  >

  /**
   * Creates an infinite query. The endpoint must have a `querySchema`; each
   * page param is merged over the call's `params`.
   *
   * @example
   * ```ts
   * const listUsers = client.infiniteQuery(listUsersEndpoint, {
   *   getNextPageParam: (lastPage, _pages, lastParam) =>
   *     lastPage.hasMore ? { ...lastParam, page: lastParam.page + 1 } : undefined,
   * })
   * ```
   */
  infiniteQuery<
    const Options extends InfiniteEndpointOptions,
    const WithResponse extends boolean = false,
  >(
    input: Inline<
      Options,
      InfiniteQuerySettings<
        Options,
        MaybeWithResponse<EndpointData<Options>, WithResponse>,
        WithResponse,
        EndpointFailure<WithBuilderErrors<Options, Errors>>
      >
    >,
  ): InfiniteQueryObject<
    WithBuilderErrors<Options, Errors> & InfiniteEndpointOptions,
    MaybeWithResponse<EndpointData<Options>, WithResponse>
  >
  infiniteQuery<
    const Options extends InfiniteEndpointOptions,
    const WithResponse extends boolean = false,
  >(
    endpoint: EndpointHandler<Options>,
    options: InfiniteQuerySettings<
      Options,
      MaybeWithResponse<EndpointData<Options>, WithResponse>,
      WithResponse
    >,
  ): InfiniteQueryObject<Options, MaybeWithResponse<EndpointData<Options>, WithResponse>>

  /**
   * Creates a mutation for any endpoint, including `body: 'multipart'`
   * uploads and `response: 'blob'` downloads.
   *
   * @example
   * ```ts
   * const updateUser = client.mutation(updateUserEndpoint, {
   *   invalidates: [listUsers, (_data, v) => getUser.key({ urlParams: v.urlParams })],
   * })
   *
   * const { mutate, error } = updateUser()
   * ```
   */
  mutation<
    const Options extends BaseEndpointOptions,
    TOnMutateResult = unknown,
    TContext = unknown,
    const WithResponse extends boolean = false,
  >(
    input: Inline<
      Options,
      MutationSettingsFor<
        WithBuilderErrors<Options, Errors>,
        TOnMutateResult,
        TContext,
        WithResponse
      >
    >,
  ): MutationObject<
    WithBuilderErrors<Options, Errors>,
    TOnMutateResult,
    MaybeWithResponse<EndpointData<Options>, WithResponse>
  >
  mutation<
    const Options extends BaseEndpointOptions,
    TOnMutateResult = unknown,
    TContext = unknown,
    const WithResponse extends boolean = false,
  >(
    endpoint: EndpointHandler<Options>,
    options?: MutationSettingsFor<Options, TOnMutateResult, TContext, WithResponse>,
  ): MutationObject<
    Options,
    TOnMutateResult,
    MaybeWithResponse<EndpointData<Options>, WithResponse>
  >
}
