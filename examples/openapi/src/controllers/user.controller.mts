import type { EndpointParams, EndpointResult } from '@navios/core'

import { Controller, Endpoint, HttpCode, NotFoundException } from '@navios/core'
import { inject } from '@navios/di'
import {
  ApiDeprecated,
  ApiOperation,
  ApiSecurity,
  ApiSummary,
  ApiTag,
} from '@navios/openapi'

import {
  createUser,
  deleteUser,
  getUser,
  legacyEndpoint,
  listUsers,
  updateUser,
} from '../api.mjs'
import { UserService } from '../services/user.service.mjs'

@ApiTag('Users', 'User management operations')
@Controller()
export class UserController {
  private readonly userService = inject(UserService)

  @Endpoint(listUsers)
  @ApiOperation({
    summary: 'List all users',
    description:
      'Retrieves a paginated list of users. Supports search filtering by name or email.',
    operationId: 'listUsers',
  })
  async listUsers(params: EndpointParams<typeof listUsers>) {
    const { page, pageSize, search } = params.params
    return this.userService.findAll({ page, pageSize, search })
  }

  @Endpoint(getUser)
  @ApiSummary('Get user by ID')
  async getUser(params: EndpointParams<typeof getUser>) {
    const user = await this.userService.findById(
      params.urlParams.userId.toString(),
    )
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(createUser)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create new user',
    description: 'Creates a new user with the provided data.',
  })
  @ApiSecurity({ bearerAuth: [] })
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }

  @Endpoint(updateUser)
  @ApiSummary('Update user')
  @ApiSecurity({ bearerAuth: [] })
  async updateUser(params: EndpointParams<typeof updateUser>) {
    const user = await this.userService.update(
      params.urlParams.userId.toString(),
      params.data,
    )
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(deleteUser)
  @ApiSummary('Delete user')
  @ApiSecurity({ bearerAuth: [] })
  async deleteUser(
    params: EndpointParams<typeof deleteUser>,
  ): EndpointResult<typeof deleteUser> {
    const success = await this.userService.delete(
      params.urlParams.userId.toString(),
    )
    if (!success) {
      throw new NotFoundException('User not found')
    }
    return { success }
  }

  @Endpoint(legacyEndpoint)
  @ApiTag('Legacy')
  @ApiDeprecated('Use GET /users instead')
  async legacyListUsers(
    params: EndpointParams<typeof legacyEndpoint>,
  ): EndpointResult<typeof legacyEndpoint> {
    const result = await this.userService.findAll({
      page: 1,
      pageSize: 100,
    })
    return result.users
  }
}
