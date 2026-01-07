import { Module } from '@navios/core/legacy-compat'

import { PostsController } from './posts.controller.mjs'

@Module({
  controllers: [PostsController],
})
export class PostsModule {}
