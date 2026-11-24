import { BadRequestException, Controller, handler, inject, reply } from '@navios/core'

import { createPostEndpoint, listPostsEndpoint } from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'

import { PostsService } from './posts.service.mjs'
import { PostsValidationService } from './posts-validation.service.mjs'

@Controller()
export class PostsController {
  private readonly postsService = inject(PostsService)

  // Attributes can also be passed as a handler option instead of a decorator.
  listPosts = handler(listPostsEndpoint, { attributes: [Public()] }, async ({ params }) => {
    const posts = await this.postsService.findAll({
      authorId: params.authorId,
      published: params.published,
    })
    return { posts }
  })

  createPost = handler(createPostEndpoint, async ({ data }, ctx) => {
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
  })
}
