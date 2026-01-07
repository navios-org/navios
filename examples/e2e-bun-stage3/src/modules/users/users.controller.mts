import type { EndpointParams, MultipartParams } from '@navios/core'

import { BadRequestException, Controller, Endpoint, HttpCode, inject, Multipart, NotFoundException } from '@navios/core'

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
  async listUsers(params: EndpointParams<typeof listUsersEndpoint>) {
    const { page, limit } = params.params
    const { users, total } = await this.usersService.findAll(page, limit)
    return { users, total, page, limit }
  }

  @Endpoint(getUserEndpoint)
  @Public()
  async getUser(params: EndpointParams<typeof getUserEndpoint>) {
    const user = await this.usersService.findById(params.urlParams.id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUserEndpoint>) {
    return this.usersService.create(params.data)
  }

  @Endpoint(updateUserEndpoint)
  async updateUser(params: EndpointParams<typeof updateUserEndpoint>) {
    const user = await this.usersService.update(params.urlParams.id, params.data)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(deleteUserEndpoint)
  async deleteUser(params: EndpointParams<typeof deleteUserEndpoint>) {
    const deleted = await this.usersService.delete(params.urlParams.id)
    if (!deleted) {
      throw new NotFoundException('User not found')
    }
    return { success: true, message: 'User deleted successfully' }
  }

  @Multipart(uploadAvatarEndpoint)
  async uploadAvatar(params: MultipartParams<typeof uploadAvatarEndpoint>) {
    const userId = params.urlParams.id
    const { avatar } = params.data
    if (!avatar) {
      throw new BadRequestException('Avatar file not provided')
    }

    const avatarUrl = `/avatars/${userId}/${avatar.name}`
    const user = await this.usersService.setAvatar(userId, avatarUrl)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return { avatarUrl }
  }
}
