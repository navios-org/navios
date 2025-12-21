import { Module } from '@navios/core'
import { PostsController } from './posts.controller.mjs'

@Module({
  controllers: [PostsController],
})
export class PostsModule {}
