import type { LoggerInstance } from '@navios/core'

import { Logger, Module } from '@navios/core'
import { Inject } from '@navios/di'

import { AclModernGuard } from '../acl/acl-modern.guard.mjs'
import { UserController } from './user.controller.mjs'

@Module({
  controllers: [UserController],
  guards: [AclModernGuard],
})
export class UserModule {
  @Inject(Logger) private accessor logger!: LoggerInstance


  onModuleInit() {
    this.logger.debug('Inside UserModule.onModuleInit')
  }
}
