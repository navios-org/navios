import { Module } from '../../../src/index.mjs'
import { UserModule } from './user/user.module.mjs'

@Module({
  imports: [UserModule],
})
export class AppModule {}
