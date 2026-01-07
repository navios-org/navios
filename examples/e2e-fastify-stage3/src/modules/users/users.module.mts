import { Module } from '@navios/core'

import { UsersController } from './users.controller.mjs'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
