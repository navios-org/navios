import { Module } from '@navios/server'

import { HealthController } from './controllers/health.controller.mjs'
import { PostController } from './controllers/post.controller.mjs'
import { UserController } from './controllers/user.controller.mjs'

@Module({
  controllers: [UserController, PostController, HealthController],
})
export class AppModule {}
