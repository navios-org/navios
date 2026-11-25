import { inject, Logger, Module } from '@navios/server'

import type { OnModuleInit } from '@navios/server'

import { UserController } from './user.controller.mjs'

@Module({ controllers: [UserController] })
export class UserModule implements OnModuleInit {
  private readonly logger = inject(Logger, { context: UserModule.name })

  onModuleInit() {
    this.logger.debug('Inside UserModule.onModuleInit')
  }
}
