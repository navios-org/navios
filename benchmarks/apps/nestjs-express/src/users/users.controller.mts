import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { UsersService } from './users.service.mjs'
import type { CreateUserInput } from '../../../../shared/schemas.js'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':userId')
  getUser(@Param('userId') userId: string) {
    return this.usersService.getById(userId)
  }

  @Post()
  @HttpCode(201)
  createUser(@Body() body: CreateUserInput) {
    return this.usersService.create(body)
  }
}
