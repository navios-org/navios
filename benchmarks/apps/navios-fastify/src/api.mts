/**
 * API endpoint declarations for Navios benchmark app
 */
import { builder } from '@navios/builder'

import { z } from 'zod'

import {
  createUserSchema,
  healthResponseSchema,
  jsonResponseSchema,
  largeDataResponseSchema,
  postsResponseSchema,
  searchQuerySchema,
  searchResponseSchema,
  statsResponseSchema,
  userSchema,
  userWithTimestampSchema,
} from '../../../shared/schemas.js'

export const API = builder()

// Health Check
export const healthEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: healthResponseSchema,
})

// JSON Serialization
export const jsonEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/json',
  responseSchema: jsonResponseSchema,
})

// Get User by ID
export const getUserEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Create User
export const createUserEndpoint = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userWithTimestampSchema,
})

// Search
export const searchEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/search',
  querySchema: searchQuerySchema,
  responseSchema: searchResponseSchema,
})

// Posts
export const postsEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  }),
  responseSchema: postsResponseSchema,
})

// Admin Stats
export const statsEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/admin/stats',
  responseSchema: statsResponseSchema,
})

// Large Data
export const largeDataEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/data/large',
  responseSchema: largeDataResponseSchema,
})
