import { Controller, Endpoint, inject, NotFoundException, reply } from '@navios/core'
import { ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import type { HandlerParams } from '@navios/core'

import { createPost, getPost, listPosts } from '../api.mjs'
import { PostService } from '../services/post.service.mjs'

@ApiTag('Posts', 'Blog post operations')
@Controller()
export class PostController {
  private readonly postService = inject(PostService)

  @Endpoint(listPosts)
  @ApiOperation({
    summary: 'List all posts',
    description: 'Retrieves posts. Can filter by author ID and publication status.',
    operationId: 'listPosts',
  })
  listPosts({ params }: HandlerParams<typeof listPosts>) {
    return this.postService.findAll(params)
  }

  @Endpoint(getPost)
  @ApiSummary('Get post by ID')
  async getPost({ urlParams }: HandlerParams<typeof getPost>) {
    const post = await this.postService.findById(urlParams.postId.toString())
    if (!post) {
      throw new NotFoundException('Post not found')
    }
    return post
  }

  @Endpoint(createPost)
  @ApiOperation({ summary: 'Create new post', description: 'Creates a new blog post.' })
  @ApiSecurity({ bearerAuth: [] })
  async createPost({ data }: HandlerParams<typeof createPost>) {
    return reply(201, await this.postService.create(data))
  }
}
