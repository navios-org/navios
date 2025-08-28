import type {
  AnyEndpointConfig,
  BaseEndpointConfig,
  BuilderInstance,
  HttpMethod,
  NaviosZodRequest,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { z, ZodObject } from 'zod/v4'

export type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export type ProcessResponseFunction<TData = unknown, TVariables = unknown> = (
  variables: TVariables,
) => Promise<TData> | TData

export type ClientOptions<ProcessResponse = unknown> = {
  api: BuilderInstance
  defaults?: {
    keyPrefix?: string[]
    keySuffix?: string[]
  }
}

export type BaseQueryParams<Config extends AnyEndpointConfig, Res = any> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse: (data: z.output<Config['responseSchema']>) => Res
}

export interface BaseMutationParams<
  Config extends AnyEndpointConfig,
  TData = unknown,
  TVariables = BaseMutationArgs<Config>,
  TResponse = z.output<Config['responseSchema']>,
  TContext = unknown,
  UseKey extends boolean = false,
> extends Omit<
    UseMutationOptions<TData, Error, TVariables>,
    'mutationKey' | 'mutationFn' | 'onSuccess' | 'onError' | 'scope'
  > {
  processResponse: ProcessResponseFunction<TData, TResponse>
  /**
   * React hooks that will prepare the context for the mutation onSuccess and onError
   * callbacks. This is useful for when you want to use the context in the callbacks
   */
  useContext?: () => TContext
  onSuccess?: (
    queryClient: QueryClient,
    data: TData,
    variables: TVariables,
    context: TContext,
  ) => void | Promise<void>
  onError?: (
    queryClient: QueryClient,
    err: unknown,
    variables: TVariables,
    context: TContext,
  ) => void | Promise<void>

  /**
   * If true, we will create a mutation key that can be shared across the project.
   */
  useKey?: UseKey
  keyPrefix?: UseKey extends true
    ? UrlHasParams<Config['url']> extends true
      ? string[]
      : never
    : never
  keySuffix?: UseKey extends true
    ? UrlHasParams<Config['url']> extends true
      ? string[]
      : never
    : never
}

export type BaseQueryArgs<Config extends AnyEndpointConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['querySchema'] extends ZodObject
    ? { params: z.input<Config['querySchema']> }
    : {})

export type BaseMutationArgs<Config extends AnyEndpointConfig> =
  NaviosZodRequest<Config>

export type InfiniteQueryOptions<
  Config extends BaseEndpointConfig<HttpMethod, string, ZodObject>,
  Res = any,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  processResponse: (data: z.infer<Config['responseSchema']>) => Res
  onFail?: (err: unknown) => void
  getNextPageParam: (
    lastPage: Res,
    allPages: Res[],
    lastPageParam: z.infer<Config['querySchema']> | undefined,
    allPageParams: z.infer<Config['querySchema']>[] | undefined,
  ) =>
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
    | undefined
  initialPageParam?:
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
}
