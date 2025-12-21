import { Controller, Get, Query } from '@nestjs/common'
import { PostsService } from './posts.service.mjs'

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  getPosts(@Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.postsService.getAll(parseInt(page, 10), parseInt(pageSize, 10))
  }
}
