import { Module } from '@navios/core/legacy-compat'

import { UsersController } from './users.controller.mjs'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
