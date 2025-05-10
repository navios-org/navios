import { Logger, Module, syncInject } from '../../../../src/index.mjs'
import { AclModernGuard } from '../acl/acl-modern.guard.mjs'
import { UserController } from './user.controller.mjs'

@Module({
  controllers: [UserController],
  guards: [AclModernGuard],
})
export class UserModule {
  logger = syncInject(Logger)
  onModuleInit() {
    this.logger.debug('Inside UserModule.onModuleInit')
  }
}
