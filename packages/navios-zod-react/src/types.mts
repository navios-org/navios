import type {
  EndpointConfig,
  UrlHasParams,
  UrlParams,
} from '@navios/navios-zod'
import type { AnyZodObject, z } from 'zod'

export type BaseQueryParams<Config extends EndpointConfig, Res = any> = {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse: (data: z.output<Config['responseSchema']>) => Res
}

export type BaseQueryArgs<Config extends EndpointConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config['querySchema'] extends AnyZodObject
    ? { params: z.input<Config['querySchema']> }
    : {})

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
  ) =>
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
    | undefined
  initialPageParam?:
    | z.input<Config['querySchema']>
    | z.infer<Config['querySchema']>
}
