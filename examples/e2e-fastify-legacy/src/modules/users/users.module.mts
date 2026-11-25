import { Module } from '@navios/server/legacy-compat'

import { UsersController } from './users.controller.mjs'

@Module({
  controllers: [UsersController],
})
export class UsersModule {}
