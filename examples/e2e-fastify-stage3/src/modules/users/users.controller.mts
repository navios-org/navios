import {
  BadRequestException,
  Controller,
  Endpoint,
  inject,
  NotFoundException,
  reply,
} from '@navios/server'

import type { HandlerParams } from '@navios/server'

import {
  createUserEndpoint,
  deleteUserEndpoint,
  getUserEndpoint,
  listUsersEndpoint,
  updateUserEndpoint,
  uploadAvatarEndpoint,
} from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'

import { UsersService } from './users.service.mjs'

@Controller()
export class UsersController {
  private readonly usersService = inject(UsersService)

  @Endpoint(listUsersEndpoint)
  @Public()
  async listUsers({ params: { page, limit } }: HandlerParams<typeof listUsersEndpoint>) {
    const { users, total } = await this.usersService.findAll(page, limit)
    return { users, total, page, limit }
  }

  // 404 is declared in the endpoint's errorSchema, so it is a typed reply.
  @Endpoint(getUserEndpoint)
  @Public()
  async getUser({ urlParams }: HandlerParams<typeof getUserEndpoint>) {
    const user = await this.usersService.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(createUserEndpoint)
  async createUser({ data }: HandlerParams<typeof createUserEndpoint>) {
    return reply(201, await this.usersService.create(data))
  }

  // 404 is not declared here: the exception becomes a problem+json response.
  @Endpoint(updateUserEndpoint)
  async updateUser({ urlParams, data }: HandlerParams<typeof updateUserEndpoint>) {
    const user = await this.usersService.update(urlParams.id, data)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(deleteUserEndpoint)
  async deleteUser({ urlParams }: HandlerParams<typeof deleteUserEndpoint>) {
    const deleted = await this.usersService.delete(urlParams.id)
    if (!deleted) {
      throw new NotFoundException('User not found')
    }
    return { success: true, message: 'User deleted successfully' }
  }

  @Endpoint(uploadAvatarEndpoint)
  async uploadAvatar({ urlParams, data: { avatar } }: HandlerParams<typeof uploadAvatarEndpoint>) {
    if (!avatar) {
      throw new BadRequestException('Avatar file not provided')
    }

    const avatarUrl = `/avatars/${urlParams.id}/${avatar.name}`
    const user = await this.usersService.setAvatar(urlParams.id, avatarUrl)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return { avatarUrl }
  }
}
