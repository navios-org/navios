import { Controller, Endpoint, inject, NotFoundException, reply } from '@navios/server'
import { ApiDeprecated, ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import type { HandlerParams, HandlerResult } from '@navios/server'

import { createUser, deleteUser, getUser, legacyEndpoint, listUsers, updateUser } from '../api.mjs'
import { UserService } from '../services/user.service.mjs'

@ApiTag('Users', 'User management operations')
@Controller()
export class UserController {
  private readonly userService = inject(UserService)

  @Endpoint(listUsers)
  @ApiOperation({
    summary: 'List all users',
    description: 'Retrieves a paginated list of users. Supports search filtering by name or email.',
    operationId: 'listUsers',
  })
  listUsers({ params }: HandlerParams<typeof listUsers>) {
    return this.userService.findAll(params)
  }

  // The 404 is declared in the endpoint's errorSchema, so it is documented
  // and reply(404, ...) is type-checked.
  @Endpoint(getUser)
  @ApiSummary('Get user by ID')
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    const user = await this.userService.findById(urlParams.userId.toString())
    return user ?? reply(404, { message: 'User not found' })
  }

  @Endpoint(createUser)
  @ApiOperation({
    summary: 'Create new user',
    description: 'Creates a new user with the provided data.',
  })
  @ApiSecurity({ bearerAuth: [] })
  async createUser({ data }: HandlerParams<typeof createUser>) {
    return reply(201, await this.userService.create(data))
  }

  @Endpoint(updateUser)
  @ApiSummary('Update user')
  @ApiSecurity({ bearerAuth: [] })
  async updateUser({ urlParams, data }: HandlerParams<typeof updateUser>) {
    const user = await this.userService.update(urlParams.userId.toString(), data)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Endpoint(deleteUser)
  @ApiSummary('Delete user')
  @ApiSecurity({ bearerAuth: [] })
  async deleteUser({ urlParams }: HandlerParams<typeof deleteUser>) {
    const success = await this.userService.delete(urlParams.userId.toString())
    if (!success) {
      throw new NotFoundException('User not found')
    }
    return { success }
  }

  @ApiTag('Legacy')
  @ApiDeprecated('Use GET /users instead')
  @Endpoint(legacyEndpoint)
  async legacyListUsers(
    _params: HandlerParams<typeof legacyEndpoint>,
  ): HandlerResult<typeof legacyEndpoint> {
    const result = await this.userService.findAll({ page: 1, pageSize: 100 })
    return result.users
  }
}
