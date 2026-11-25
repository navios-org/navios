import { Module } from '@navios/server'

import { UsersController } from './users.controller.mjs'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
