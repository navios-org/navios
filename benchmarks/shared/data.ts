/**
 * Shared data generators for benchmark applications
 * Ensures all apps return identical data for fair comparison
 */

import type {
  HealthResponse,
  JsonResponse,
  LargeDataResponse,
  LargeItem,
  Post,
  PostsResponse,
  SearchResponse,
  StatsResponse,
  User,
  UserWithTimestamp,
} from './schemas.js'

// Fixed timestamp for deterministic responses
const FIXED_TIMESTAMP = '2024-01-15T10:30:00.000Z'

// ============================================
// Health
// ============================================
export function getHealthResponse(): HealthResponse {
  return { status: 'ok' }
}

// ============================================
// JSON
// ============================================
export function getJsonResponse(): JsonResponse {
  return {
    message: 'Hello, World!',
    timestamp: FIXED_TIMESTAMP,
    data: {
      id: 1,
      name: 'benchmark',
      values: [1, 2, 3, 4, 5],
    },
  }
}

// ============================================
// Users
// ============================================
export function getUserById(id: string): User {
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
  }
}

let userIdCounter = 0

export function createUser(input: {
  name: string
  email: string
  age?: number
}): UserWithTimestamp {
  userIdCounter++
  return {
    id: `usr_${userIdCounter}`,
    name: input.name,
    email: input.email,
    age: input.age,
    createdAt: FIXED_TIMESTAMP,
  }
}

// ============================================
// Search
// ============================================
export function getSearchResults(
  query: string,
  page: number,
  limit: number,
): SearchResponse {
  return {
    query,
    page,
    limit,
    results: [],
  }
}

// ============================================
// Posts
// ============================================
const POSTS_DATA: Post[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1),
  title: `Post ${i + 1}`,
  content: `This is the content of post ${i + 1}. It contains some text for benchmarking purposes.`,
}))

export function getPosts(page = 1, pageSize = 10): PostsResponse {
  const start = (page - 1) * pageSize
  const posts = POSTS_DATA.slice(start, start + pageSize)

  return {
    posts,
    total: POSTS_DATA.length,
    page,
    pageSize,
  }
}

// ============================================
// Stats
// ============================================
export function getStats(): StatsResponse {
  return {
    totalUsers: 1000,
    activeUsers: 750,
    requestsToday: 50000,
  }
}

// ============================================
// Large Data
// ============================================
const LARGE_DATA: LargeItem[] = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
  description: `This is a detailed description for item ${i + 1}. It contains enough text to make the response payload reasonably sized for benchmarking JSON serialization performance.`,
  metadata: {
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    tags: ['benchmark', 'test', `tag-${i % 10}`],
    score: Math.round((i % 100) * 0.1 * 100) / 100,
  },
}))

export function getLargeData(): LargeDataResponse {
  return {
    items: LARGE_DATA,
  }
}
