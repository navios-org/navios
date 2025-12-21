import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common'

import type { CreateUserInput } from '../../../../shared/schemas.js'

import { UsersService } from './users.service.mjs'

@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

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
