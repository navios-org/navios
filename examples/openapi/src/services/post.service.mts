import { Injectable } from '@navios/core'

import type { createPostSchema, postSchema } from '../api.mjs'
import type { z } from 'zod'

type Post = z.infer<typeof postSchema>
type CreatePostInput = z.infer<typeof createPostSchema>

@Injectable()
export class PostService {
  private posts: Map<string, Post> = new Map([
    [
      'post_1',
      {
        id: 'post_1',
        title: 'Getting Started with Navios',
        content: 'Learn how to build type-safe APIs with Navios...',
        authorId: 'usr_1',
        published: true,
        createdAt: '2024-01-11T09:00:00Z',
      },
    ],
    [
      'post_2',
      {
        id: 'post_2',
        title: 'Advanced Dependency Injection',
        content: 'Deep dive into the DI system...',
        authorId: 'usr_1',
        published: true,
        createdAt: '2024-01-13T11:00:00Z',
      },
    ],
    [
      'post_3',
      {
        id: 'post_3',
        title: 'Draft: OpenAPI Integration',
        content: 'Coming soon...',
        authorId: 'usr_2',
        published: false,
        createdAt: '2024-01-16T16:00:00Z',
      },
    ],
  ])

  async findAll(options: { authorId?: string; published?: boolean }) {
    let posts = Array.from(this.posts.values())

    if (options.authorId) {
      posts = posts.filter((p) => p.authorId === options.authorId)
    }

    if (options.published !== undefined) {
      posts = posts.filter((p) => p.published === options.published)
    }

    return posts
  }

  async findById(id: string): Promise<Post | null> {
    return this.posts.get(id) ?? null
  }

  async create(input: CreatePostInput): Promise<Post> {
    const id = `post_${Date.now()}`
    const post: Post = {
      id,
      ...input,
      createdAt: new Date().toISOString(),
    }
    this.posts.set(id, post)
    return post
  }
}
