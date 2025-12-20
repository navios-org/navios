import { builder } from '@navios/builder'
import { z } from 'zod'

export const API = builder()

// ============================================================================
// Schemas with OpenAPI metadata
// ============================================================================

export const userSchema = z.object({
  id: z.string().meta({
    openapi: {
      description: 'Unique user identifier',
      example: 'usr_abc123',
    },
  }),
  name: z.string().min(1).max(100).meta({
    openapi: {
      description: 'User display name',
      example: 'John Doe',
    },
  }),
  email: z.string().email().meta({
    openapi: {
      description: 'User email address',
      example: 'john@example.com',
    },
  }),
  role: z.enum(['user', 'admin', 'moderator']).meta({
    openapi: {
      description: 'User role in the system',
      example: 'user',
    },
  }),
  createdAt: z.string().meta({
    openapi: {
      description: 'When the user was created',
      example: '2024-01-15T10:30:00Z',
    },
  }),
})

export const createUserSchema = userSchema.omit({ id: true, createdAt: true })

export const updateUserSchema = createUserSchema.partial()

export const userListSchema = z.object({
  users: z.array(userSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  published: z.boolean(),
  createdAt: z.string(),
})

export const createPostSchema = postSchema.omit({ id: true, createdAt: true })

// ============================================================================
// User Endpoints
// ============================================================================

export const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().optional().default(1),
    pageSize: z.coerce.number().optional().default(10),
    search: z.string().optional(),
  }),
  responseSchema: userListSchema,
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
})

export const updateUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
})

export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
})

// ============================================================================
// Post Endpoints
// ============================================================================

export const listPosts = API.declareEndpoint({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({
    authorId: z.string().optional(),
    published: z.coerce.boolean().optional(),
  }),
  responseSchema: z.array(postSchema),
})

export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/posts/$postId',
  responseSchema: postSchema,
})

export const createPost = API.declareEndpoint({
  method: 'POST',
  url: '/posts',
  requestSchema: createPostSchema,
  responseSchema: postSchema,
})

// ============================================================================
// Health & Misc Endpoints
// ============================================================================

export const healthCheck = API.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string(),
    version: z.string(),
  }),
})

export const legacyEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/v1/users',
  responseSchema: z.array(userSchema),
})
