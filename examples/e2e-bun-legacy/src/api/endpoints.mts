import { builder } from '@navios/builder'
import { z } from 'zod/v4'

const api = builder()

// ============ Common Schemas ============
export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'guest']),
  createdAt: z.string(),
})

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  published: z.boolean(),
  createdAt: z.string(),
})

export const FileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size: z.number(),
  mimeType: z.string(),
  createdAt: z.string(),
})

// ============ Health Endpoints ============
export const healthEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({
    status: z.string(),
    timestamp: z.string(),
  }),
})

// ============ User Endpoints (CRUD) ============
export const listUsersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(20),
  }),
  responseSchema: z.object({
    users: z.array(UserSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
})

export const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
})

export const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    role: z.enum(['admin', 'user', 'guest']).optional().default('user'),
  }),
  responseSchema: UserSchema,
})

export const updateUserEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$id',
  requestSchema: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'user', 'guest']).optional(),
  }),
  responseSchema: UserSchema,
})

export const deleteUserEndpoint = api.declareEndpoint({
  method: 'DELETE',
  url: '/users/$id',
  responseSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})

// ============ Post Endpoints ============
export const listPostsEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({
    authorId: z.string().optional(),
    published: z.coerce.boolean().optional(),
  }),
  responseSchema: z.object({
    posts: z.array(PostSchema),
  }),
})

export const createPostEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/posts',
  requestSchema: z.object({
    title: z.string().min(3),
    content: z.string().min(10),
    authorId: z.string(),
    published: z.boolean().optional().default(false),
  }),
  responseSchema: PostSchema.extend({
    validationId: z.string(),
  }),
})

// ============ Streaming Endpoints ============
export const streamEventsEndpoint = api.declareStream({
  method: 'GET',
  url: '/events/stream',
  querySchema: z.object({
    topic: z.string().optional(),
  }),
})

export const downloadFileEndpoint = api.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

export const exportDataEndpoint = api.declareStream({
  method: 'POST',
  url: '/export',
  requestSchema: z.object({
    format: z.enum(['json', 'csv']),
    type: z.enum(['users', 'posts']),
  }),
})

// ============ Multipart/File Upload Endpoints ============
export const uploadFileEndpoint = api.declareMultipart({
  method: 'POST',
  url: '/files/upload',
  requestSchema: z.object({
    file: z.instanceof(File).optional(),
    description: z.string().optional(),
  }),
  responseSchema: FileSchema,
})

export const uploadMultipleEndpoint = api.declareMultipart({
  method: 'POST',
  url: '/files/upload-multiple',
  requestSchema: z.object({
    files: z.array(z.instanceof(File)).optional(),
    category: z.string().optional(),
  }),
  responseSchema: z.object({
    uploaded: z.array(z.object({
      id: z.string(),
      filename: z.string(),
    })),
    total: z.number(),
  }),
})

export const uploadAvatarEndpoint = api.declareMultipart({
  method: 'POST',
  url: '/users/$id/avatar',
  requestSchema: z.object({
    avatar: z.instanceof(File).optional(),
  }),
  responseSchema: z.object({
    avatarUrl: z.string(),
  }),
})

// ============ Error Testing Endpoints ============
export const validationErrorEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/test/validation-error',
  requestSchema: z.object({
    requiredField: z.string(),
  }),
  responseSchema: z.object({
    success: z.boolean(),
  }),
})

export const notFoundEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/test/not-found/$id',
  responseSchema: z.object({
    id: z.string(),
  }),
})

export const protectedEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/test/protected',
  responseSchema: z.object({
    data: z.string(),
  }),
})
