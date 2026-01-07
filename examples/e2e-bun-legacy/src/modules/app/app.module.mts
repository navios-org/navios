import { Module } from '@navios/core/legacy-compat'

import { AuthGuard } from '../../guards/auth.guard.mjs'
import { FilesModule } from '../files/files.module.mjs'
import { PostsModule } from '../posts/posts.module.mjs'
import { UsersModule } from '../users/users.module.mjs'

import { AppController } from './app.controller.mjs'

@Module({
  imports: [UsersModule, PostsModule, FilesModule],
  controllers: [AppController],
  guards: [AuthGuard],
})
export class AppModule {}
