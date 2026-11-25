import { Module } from '@navios/server/legacy-compat'

import { PostsController } from './posts.controller.mjs'

@Module({
  controllers: [PostsController],
})
export class PostsModule {}
