/**
 * Shared schemas and types for benchmark applications
 * All benchmark apps must use these exact schemas for fairness
 */

import { z } from 'zod'

// ============================================
// Health Check
// ============================================
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

// ============================================
// JSON Serialization
// ============================================
export const jsonResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  data: z.object({
    id: z.number(),
    name: z.string(),
    values: z.array(z.number()),
  }),
})

export type JsonResponse = z.infer<typeof jsonResponseSchema>

// ============================================
// Users
// ============================================
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const userWithTimestampSchema = userSchema.extend({
  age: z.number().optional(),
  createdAt: z.string(),
})

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
})

export type User = z.infer<typeof userSchema>
export type UserWithTimestamp = z.infer<typeof userWithTimestampSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>

// ============================================
// Search
// ============================================
export const searchQuerySchema = z.object({
  q: z.string(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export const searchResponseSchema = z.object({
  query: z.string(),
  page: z.number(),
  limit: z.number(),
  results: z.array(z.unknown()),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
export type SearchResponse = z.infer<typeof searchResponseSchema>

// ============================================
// Posts
// ============================================
export const postSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
})

export const postsResponseSchema = z.object({
  posts: z.array(postSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export type Post = z.infer<typeof postSchema>
export type PostsResponse = z.infer<typeof postsResponseSchema>

// ============================================
// Admin Stats
// ============================================
export const statsResponseSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  requestsToday: z.number(),
})

export type StatsResponse = z.infer<typeof statsResponseSchema>

// ============================================
// Large Data
// ============================================
export const largeItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    tags: z.array(z.string()),
    score: z.number(),
  }),
})

export const largeDataResponseSchema = z.object({
  items: z.array(largeItemSchema),
})

export type LargeItem = z.infer<typeof largeItemSchema>
export type LargeDataResponse = z.infer<typeof largeDataResponseSchema>
