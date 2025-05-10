import { Module } from '../../../../src/index.mjs'
import { AclModernGuard } from '../acl/acl-modern.guard.mjs'
import { UserController } from './user.controller.mjs'

@Module({
  controllers: [UserController],
  guards: [AclModernGuard],
})
export class UserModule {
  onModuleInit() {
    console.log('User module initialized')
  }
}
