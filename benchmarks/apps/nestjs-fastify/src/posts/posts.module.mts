import { Module } from '@nestjs/common'
import { PostsController } from './posts.controller.mjs'
import { PostsService } from './posts.service.mjs'

@Module({
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
