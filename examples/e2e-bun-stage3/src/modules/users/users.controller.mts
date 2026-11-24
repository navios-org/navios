import {
  BadRequestException,
  Controller,
  handler,
  inject,
  NotFoundException,
  reply,
} from '@navios/core'

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

  @Public()
  listUsers = handler(listUsersEndpoint, async ({ params: { page, limit } }) => {
    const { users, total } = await this.usersService.findAll(page, limit)
    return { users, total, page, limit }
  })

  @Public()
  getUser = handler(getUserEndpoint, async ({ urlParams }) => {
    const user = await this.usersService.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  })

  createUser = handler(createUserEndpoint, async ({ data }) =>
    reply(201, await this.usersService.create(data)),
  )

  updateUser = handler(updateUserEndpoint, async ({ urlParams, data }) => {
    const user = await this.usersService.update(urlParams.id, data)
    return user ?? reply(404, { message: 'User not found' })
  })

  deleteUser = handler(deleteUserEndpoint, async ({ urlParams }) => {
    const deleted = await this.usersService.delete(urlParams.id)
    if (!deleted) {
      return reply(404, { message: 'User not found' })
    }
    return { success: true, message: 'User deleted successfully' }
  })

  uploadAvatar = handler(uploadAvatarEndpoint, async ({ urlParams, data: { avatar } }) => {
    if (!avatar) {
      throw new BadRequestException('Avatar file not provided')
    }

    const avatarUrl = `/avatars/${urlParams.id}/${avatar.name}`
    const user = await this.usersService.setAvatar(urlParams.id, avatarUrl)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return { avatarUrl }
  })
}
