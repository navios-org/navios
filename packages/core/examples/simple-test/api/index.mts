import { builder } from '@navios/builder'

import { z } from 'zod/v4'

export const authApi = builder({
  useDiscriminatorResponse: true,
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

export const discriminatorEndpoint = authApi.declareEndpoint({
  method: 'GET',
  url: '/discriminator',
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: z.object({
        id: z.string(),
        name: z.string(),

        email: z.string(),
      }),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({
        code: z.string(),
        message: z.string(),
      }),
    }),
  ]),
})

export const multipartEndpoint = authApi.declareMultipart({
  method: 'POST',
  url: '/multipart',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)),
    something: z.string(),
  }),
  responseSchema: z.object({}),
})
