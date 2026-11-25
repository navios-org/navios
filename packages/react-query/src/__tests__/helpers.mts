import { builder } from '@navios/builder'
import { QueryClient } from '@tanstack/react-query'

import type { AbstractRequestConfig, AbstractResponse, Client } from '@navios/builder'

import { declareClient } from '../client/declare-client.mjs'

type Responder = (config: AbstractRequestConfig) => Partial<AbstractResponse<unknown>>

/** In-memory HTTP client: records calls and answers from a responder. */
export function makeHttp(initial: Responder = () => ({ data: null })) {
  const calls: AbstractRequestConfig[] = []
  let responder = initial
  const client: Client = {
    request: async (config) => {
      calls.push(config)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: null,
        ...responder(config),
      } as never
    },
  }
  return {
    client,
    calls,
    respond: (next: Responder) => {
      responder = next
    },
  }
}

export function setup(initial?: Responder) {
  const http = makeHttp(initial)
  const api = builder({ client: http.client })
  const client = declareClient({ api })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return { http, api, client, queryClient }
}
