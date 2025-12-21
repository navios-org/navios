import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'
import { inject } from '@navios/di'

import { postsEndpoint } from '../api.mjs'
import { PostsService } from './posts.service.mjs'

@Controller()
export class PostsController {
  private readonly postsService = inject(PostsService)

  @Endpoint(postsEndpoint)
  getPosts(params: EndpointParams<typeof postsEndpoint>) {
    const { page, pageSize } = params.params
    return this.postsService.getAll(page, pageSize)
  }
}
