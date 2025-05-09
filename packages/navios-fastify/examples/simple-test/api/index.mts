import { declareAPI } from '@navios/navios-zod'

import { z } from 'zod'

export const authApi = declareAPI({
  useWholeResponse: true,
})

export const userEndpoint = authApi.declareEndpoint({
  method: 'GET',
  url: '/user',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})

export const patchUserEndpoint = authApi.declareEndpoint({
  method: 'PATCH',
  url: '/user',
  requestSchema: z.object({
    name: z.string(),
    email: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})

export const blogItemEndpoint = authApi.declareEndpoint({
  method: 'GET',
  url: '/blog/$id' as const,
  responseSchema: z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
  }),
})
