import { Controller, handler, inject, NotFoundException, reply } from '@navios/core'
import { ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import { createPost, getPost, listPosts } from '../api.mjs'
import { PostService } from '../services/post.service.mjs'

@ApiTag('Posts', 'Blog post operations')
@Controller()
export class PostController {
  private readonly postService = inject(PostService)

  @ApiOperation({
    summary: 'List all posts',
    description: 'Retrieves posts. Can filter by author ID and publication status.',
    operationId: 'listPosts',
  })
  listPosts = handler(listPosts, ({ params }) => this.postService.findAll(params))

  @ApiSummary('Get post by ID')
  getPost = handler(getPost, async ({ urlParams }) => {
    const post = await this.postService.findById(urlParams.postId.toString())
    if (!post) {
      throw new NotFoundException('Post not found')
    }
    return post
  })

  // Documentation attributes can also be given in the handler options.
  createPost = handler(
    createPost,
    {
      attributes: [
        ApiOperation({ summary: 'Create new post', description: 'Creates a new blog post.' }),
        ApiSecurity({ bearerAuth: [] }),
      ],
    },
    async ({ data }) => reply(201, await this.postService.create(data)),
  )
}
