import { Module } from '../../../src/index.mjs'
import { AppGuard } from './acl/app.guard.mjs'
import { UserModule } from './user/user.module.mjs'

@Module({
  imports: [UserModule],
  guards: [AppGuard],
})
export class AppModule {}
