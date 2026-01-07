import { Injectable } from '@navios/core'

export interface Post {
  id: string
  title: string
  content: string
  authorId: string
  published: boolean
  createdAt: string
}

export interface CreatePostDto {
  title: string
  content: string
  authorId: string
  published?: boolean
}

@Injectable()
export class PostsService {
  private posts: Map<string, Post> = new Map()
  private idCounter = 0

  async findAll(filters?: { authorId?: string; published?: boolean }): Promise<Post[]> {
    let posts = Array.from(this.posts.values())

    if (filters?.authorId) {
      posts = posts.filter((p) => p.authorId === filters.authorId)
    }

    if (filters?.published !== undefined) {
      posts = posts.filter((p) => p.published === filters.published)
    }

    return posts
  }

  async findById(id: string): Promise<Post | null> {
    return this.posts.get(id) ?? null
  }

  async create(dto: CreatePostDto): Promise<Post> {
    const id = `post-${++this.idCounter}`
    const post: Post = {
      id,
      title: dto.title,
      content: dto.content,
      authorId: dto.authorId,
      published: dto.published ?? false,
      createdAt: new Date().toISOString(),
    }
    this.posts.set(id, post)
    return post
  }

  async clear(): Promise<void> {
    this.posts.clear()
    this.idCounter = 0
  }
}
