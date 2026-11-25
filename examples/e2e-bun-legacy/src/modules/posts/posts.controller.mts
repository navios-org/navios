import type { HandlerParams, RequestContext } from '@navios/server'

import { BadRequestException, inject, reply } from '@navios/server'
import { Controller, Endpoint } from '@navios/server/legacy-compat'

import { createPostEndpoint, listPostsEndpoint } from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'

import { PostsService } from './posts.service.mjs'
import { PostsValidationService } from './posts-validation.service.mjs'

@Controller()
export class PostsController {
  private readonly postsService = inject(PostsService)

  @Endpoint(listPostsEndpoint)
  @Public()
  async listPosts({ params }: HandlerParams<typeof listPostsEndpoint>) {
    const posts = await this.postsService.findAll({
      authorId: params.authorId,
      published: params.published,
    })
    return { posts }
  }

  @Endpoint(createPostEndpoint)
  async createPost({ data }: HandlerParams<typeof createPostEndpoint>, ctx: RequestContext) {
    const { title, content, authorId, published } = data

    // Controllers are singletons: the request-scoped validation service comes
    // from this request's DI scope.
    const validationService = ctx.use(PostsValidationService)
    const validation = validationService.validate(title, content)
    if (!validation.isValid) {
      throw new BadRequestException(validation.errors.join(', '))
    }

    const post = await this.postsService.create({ title, content, authorId, published })

    return reply(201, {
      ...post,
      validationId: validationService.getValidationId(),
    })
  }
}
