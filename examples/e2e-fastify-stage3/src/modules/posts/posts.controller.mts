import type { EndpointParams } from '@navios/core'

import { BadRequestException, Controller, Endpoint, HttpCode } from '@navios/core'
import { Inject } from '@navios/di'

import { createPostEndpoint, listPostsEndpoint } from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'

import { PostsService } from './posts.service.mjs'
import { PostsValidationService } from './posts-validation.service.mjs'

@Controller()
export class PostsController {
  @Inject(PostsService) private accessor postsService!: PostsService
  @Inject(PostsValidationService) private accessor validationService!: PostsValidationService

  @Endpoint(listPostsEndpoint)
  @Public()
  async listPosts(params: EndpointParams<typeof listPostsEndpoint>) {
    const posts = await this.postsService.findAll({
      authorId: params.params.authorId,
      published: params.params.published,
    })
    return { posts }
  }

  @Endpoint(createPostEndpoint)
  @HttpCode(201)
  async createPost(params: EndpointParams<typeof createPostEndpoint>) {
    const { title, content, authorId, published } = params.data

    // Use request-scoped validation service
    const validation = this.validationService.validate(title, content)
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '))
    }

    const post = await this.postsService.create({ title, content, authorId, published })

    return {
      ...post,
      validationId: this.validationService.getValidationId(),
    }
  }
}
