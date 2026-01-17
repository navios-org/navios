import { builder } from '@navios/builder'
import { z } from 'zod/v4'

const api = builder()

// ============ Common Schemas ============
export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),
  category: z.string(),
  createdAt: z.string(),
})

export type Item = z.infer<typeof ItemSchema>

// ============ Health Endpoint ============
export const healthEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/health',
  responseSchema: z.object({
    status: z.string(),
    timestamp: z.string(),
    uptime: z.number(),
  }),
})

// ============ Metrics Endpoint ============
export const metricsEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/metrics',
  responseSchema: z.object({
    requestCount: z.number(),
    errorCount: z.number(),
  }),
})

// ============ Item Endpoints ============
export const listItemsEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/items',
  querySchema: z.object({
    category: z.string().optional(),
    minPrice: z.coerce.number().optional(),
    maxPrice: z.coerce.number().optional(),
  }),
  responseSchema: z.object({
    items: z.array(ItemSchema),
    total: z.number(),
  }),
})

export const getItemEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/items/$id',
  responseSchema: ItemSchema,
})

export const createItemEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/items',
  requestSchema: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().positive(),
    category: z.string().min(1),
  }),
  responseSchema: ItemSchema,
})

export const updateItemEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/items/$id',
  requestSchema: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().positive().optional(),
    category: z.string().min(1).optional(),
  }),
  responseSchema: ItemSchema,
})

export const deleteItemEndpoint = api.declareEndpoint({
  method: 'DELETE',
  url: '/items/$id',
  responseSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
})

// ============ Slow Endpoint (for testing traces) ============
export const slowEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/slow',
  querySchema: z.object({
    delay: z.coerce.number().optional().default(1000),
  }),
  responseSchema: z.object({
    message: z.string(),
    delayMs: z.number(),
  }),
})

// ============ Error Endpoint (for testing error traces) ============
export const errorEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/error',
  querySchema: z.object({
    type: z.enum(['validation', 'not-found', 'internal']).optional().default('internal'),
  }),
  responseSchema: z.object({
    message: z.string(),
  }),
})

// ============ Chain Endpoint (for testing nested spans) ============
export const chainEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/chain',
  querySchema: z.object({
    depth: z.coerce.number().optional().default(3),
  }),
  responseSchema: z.object({
    result: z.string(),
    depth: z.number(),
  }),
})
