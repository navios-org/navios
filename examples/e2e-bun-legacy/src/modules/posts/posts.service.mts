import { Injectable } from '@navios/core/legacy-compat'

export interface Post {
  id: string
  title: string
  content: string
  authorId: string
  published: boolean
  createdAt: string
}

@Injectable()
export class PostsService {
  private posts: Map<string, Post> = new Map()
  private idCounter = 0

  async findAll(filters: { authorId?: string; published?: boolean }): Promise<Post[]> {
    let posts = Array.from(this.posts.values())

    if (filters.authorId) {
      posts = posts.filter((p) => p.authorId === filters.authorId)
    }
    if (filters.published !== undefined) {
      posts = posts.filter((p) => p.published === filters.published)
    }

    return posts
  }

  async create(data: {
    title: string
    content: string
    authorId: string
    published?: boolean
  }): Promise<Post> {
    const id = `post-${++this.idCounter}`
    const post: Post = {
      id,
      title: data.title,
      content: data.content,
      authorId: data.authorId,
      published: data.published ?? false,
      createdAt: new Date().toISOString(),
    }
    this.posts.set(id, post)
    return post
  }
}
