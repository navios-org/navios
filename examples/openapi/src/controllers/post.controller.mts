import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint, HttpCode, NotFoundException } from '@navios/core'
import { inject } from '@navios/di'
import { ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import { createPost, getPost, listPosts } from '../api.mjs'
import { PostService } from '../services/post.service.mjs'

@ApiTag('Posts', 'Blog post operations')
@Controller()
export class PostController {
  private readonly postService = inject(PostService)

  @Endpoint(listPosts)
  @ApiOperation({
    summary: 'List all posts',
    description:
      'Retrieves posts. Can filter by author ID and publication status.',
    operationId: 'listPosts',
  })
  async listPosts(params: EndpointParams<typeof listPosts>) {
    return this.postService.findAll(params.params)
  }

  @Endpoint(getPost)
  @ApiSummary('Get post by ID')
  async getPost(params: EndpointParams<typeof getPost>) {
    const post = await this.postService.findById(
      params.urlParams.postId.toString(),
    )
    if (!post) {
      throw new NotFoundException('Post not found')
    }
    return post
  }

  @Endpoint(createPost)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create new post',
    description: 'Creates a new blog post.',
  })
  @ApiSecurity({ bearerAuth: [] })
  async createPost(params: EndpointParams<typeof createPost>) {
    return this.postService.create(params.data)
  }
}
