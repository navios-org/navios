import { builder } from '@navios/builder'
import { createMockClient } from '@navios/builder/mock'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { declareClient } from '../client/declare-client.mjs'
import { setHttpClient } from '../endpoint/http-client.mjs'

import { makeHttp } from './helpers.mjs'

const userSchema = z.object({ id: z.string(), name: z.string() })

function setup() {
  const http = makeHttp(() => ({ data: { id: 'real', name: 'Real' } }))
  const mocks = createMockClient()
  const api = builder({ client: mocks.wrap(http.client) })
  const client = declareClient({ api })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { http, mocks, api, client, queryClient }
}

describe('@navios/builder/mock with react-query', () => {
  it('mocks an inline query by its query object', async () => {
    const { mocks, client, queryClient, http } = setup()
    const getUser = client.query({
      method: 'GET',
      url: '/users/$userId',
      responseSchema: userSchema,
    })
    mocks.on(getUser, ({ urlParams }) => ({ id: String(urlParams.userId), name: 'Mock' }))

    const user = await getUser.fetch(queryClient, { urlParams: { userId: 3 } })

    expect(user).toEqual({ id: '3', name: 'Mock' })
    expect(http.calls).toHaveLength(0)
  })

  it('mocks a mutation, and the rest of the API still reaches the real client', async () => {
    const { mocks, client, queryClient, http } = setup()
    const listUsers = client.query({ method: 'GET', url: '/users', responseSchema: z.any() })
    const createUser = client.mutation({
      method: 'POST',
      url: '/users',
      requestSchema: z.object({ name: z.string() }),
      responseSchema: userSchema,
    })
    mocks.on(createUser, ({ data }) => ({ id: 'new', name: data.name }))

    const created = await createUser.endpoint({ data: { name: 'Ada' } })
    await listUsers.fetch(queryClient)

    expect(created).toEqual({ id: 'new', name: 'Ada' })
    expect(mocks.calls(createUser)).toHaveLength(1)
    expect(http.calls).toEqual([expect.objectContaining({ method: 'GET', url: '/users' })])
  })

  it('works as the per-QueryClient client of setHttpClient', async () => {
    const { client, queryClient } = setup()
    const getUser = client.query({ method: 'GET', url: '/me', responseSchema: userSchema })
    const perRequest = createMockClient()
    perRequest.on(getUser, () => ({ id: 'ssr', name: 'Per request' }))
    setHttpClient(queryClient, perRequest)

    await expect(getUser.fetch(queryClient)).resolves.toEqual({ id: 'ssr', name: 'Per request' })
  })
})
