import { builder } from '@navios/builder'
import { z } from 'zod/v4'

export const api = builder()

export const noteSchema = z.object({
  id: z.number(),
  text: z.string(),
  createdAt: z.string(),
})

export const getMe = api.declareEndpoint({
  method: 'GET',
  url: '/me',
  responseSchema: z.object({ id: z.string(), email: z.string(), plan: z.string() }),
})

export const listNotes = api.declareEndpoint({
  method: 'GET',
  url: '/notes',
  responseSchema: z.array(noteSchema),
})

export const createNote = api.declareEndpoint({
  method: 'POST',
  url: '/notes',
  requestSchema: z.object({ text: z.string().min(1).max(500) }),
  responseSchema: noteSchema,
})
