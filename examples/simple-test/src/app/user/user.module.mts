import { inject, Logger, Module } from '@navios/core'

import { AclModernGuard } from '../acl/acl-modern.guard.mjs'
import { UserController } from './user.controller.mjs'

@Module({
  controllers: [UserController],
  guards: [AclModernGuard],
})
export class UserModule {
  logger = inject(Logger)
  onModuleInit() {
    this.logger.debug('Inside UserModule.onModuleInit')
  }
}
