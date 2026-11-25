import { Module } from '@navios/server'

import { PostsController } from './posts.controller.mjs'

@Module({
  controllers: [PostsController],
})
export class PostsModule {}
