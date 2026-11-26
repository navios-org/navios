import { describe, expectTypeOf, test } from 'vitest'

import type { Client } from '../../index.mjs'

/**
 * The parts of axios 1.x's `AxiosInstance.request` that decide whether an
 * instance is a `Client`, spelled as axios spells them. axios is not a
 * dependency of this package, so they are copied here.
 */
type AxiosResponseType =
  | 'arraybuffer'
  | 'blob'
  | 'document'
  | 'json'
  | 'text'
  | 'stream'
  | 'formdata'

interface GenericAbortSignal {
  readonly aborted: boolean
  onabort?: ((...args: any) => any) | null
  addEventListener?: (...args: any) => any
  removeEventListener?: (...args: any) => any
}

interface AxiosLikeRequestConfig<D = any> {
  url?: string
  method?: string
  params?: any
  data?: D
  headers?: Record<string, string | number | boolean>
  timeout?: number
  responseType?: AxiosResponseType
  signal?: GenericAbortSignal
  withCredentials?: boolean
}

interface AxiosLikeResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
}

interface AxiosLikeInstance {
  request<T = any, R = AxiosLikeResponse<T>, D = any>(config: AxiosLikeRequestConfig<D>): Promise<R>
}

describe('Client', () => {
  test('an axios instance is a Client without a cast', () => {
    expectTypeOf<AxiosLikeInstance>().toExtend<Client>()
  })

  test('a client may take the call context as a second argument', () => {
    const client: Client = {
      request: async (config, context) => {
        expectTypeOf(context?.endpoint.url).toEqualTypeOf<string | undefined>()
        expectTypeOf(context?.args.urlParams).toEqualTypeOf<Record<string, unknown> | undefined>()
        return { data: config.url as never, status: 200, statusText: 'OK', headers: {} }
      },
    }
    expectTypeOf(client).toExtend<Client>()
  })
})
