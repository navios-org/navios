import { Module } from '@nestjs/common'
import { UsersController } from './users.controller.mjs'
import { UsersService } from './users.service.mjs'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
