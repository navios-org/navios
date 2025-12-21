import { Module } from '@navios/core'
import { HealthController } from './health/health.controller.mjs'
import { SearchController } from './search/search.controller.mjs'
import { DataController } from './data/data.controller.mjs'
import { UsersModule } from './users/users.module.mjs'
import { PostsModule } from './posts/posts.module.mjs'
import { AdminModule } from './admin/admin.module.mjs'

@Module({
  imports: [UsersModule, PostsModule, AdminModule],
  controllers: [HealthController, SearchController, DataController],
})
export class AppModule {}
