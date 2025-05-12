import type {
  BaseEndpointConfig,
  EndpointFunctionArgs,
  HttpMethod,
  Util_FlatObject,
} from '@navios/common'
import type { z } from 'zod'

export type ClientEndpointHelper<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  RequestSchema = unknown,
  ResponseSchema extends z.ZodType = z.ZodType,
  QuerySchema = unknown,
> = {
  endpoint: ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
    >,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      QuerySchema,
      ResponseSchema,
      RequestSchema
    >
  }
}
