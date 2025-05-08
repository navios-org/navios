import type {
  DeclareAPI,
  EndpointConfig,
  EndpointWithDataConfig,
  NaviosZodRequest,
  UrlHasParams,
  UrlParams,
} from '@navios/navios-zod'
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query'
import type { AnyZodObject, z, ZodDiscriminatedUnion } from 'zod'

export type ProcessResponseFunction<TData = unknown, TVariables = unknown> = (
  variables: TVariables,
) => Promise<TData> | TData

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never

// Converts union to overloaded function
type UnionToOvlds<U> = UnionToIntersection<
  U extends any ? (f: U) => void : never
>

type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never

type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true

export type ClientOptions<ProcessResponse = unknown> = {
  api: DeclareAPI
  defaults?: {
    keyPrefix?: string[]
    keySuffix?: string[]
  }
}

export type BaseQueryParams<Config extends EndpointConfig, Res = any> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse: (data: z.output<Config['responseSchema']>) => Res
}

export type StrictReturnType<T extends (...args: any) => any> = T extends (
  ...args: any
) => infer R
  ? R
  : never

export interface BaseMutationParams<
  Config extends EndpointConfig | EndpointWithDataConfig,
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

export type BaseQueryArgs<Config extends EndpointConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['querySchema'] extends AnyZodObject
    ? { params: z.input<Config['querySchema']> }
    : {})

export type BaseMutationArgs<
  Config extends EndpointConfig | EndpointWithDataConfig,
> = NaviosZodRequest<Config>

export type InfiniteQueryOptions<
  Config extends Required<EndpointConfig> = Required<EndpointConfig>,
  Res = any,
> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  processResponse: (data: z.infer<Config['responseSchema']>) => Res
  onFail?: (err: unknown) => void
  getNextPageParam: (
    lastPage: z.infer<Config['responseSchema']>,
    allPages: z.infer<Config['responseSchema']>[],
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
