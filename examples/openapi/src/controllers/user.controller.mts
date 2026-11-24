import { Controller, Endpoint, handler, inject, NotFoundException, reply } from '@navios/core'
import { ApiDeprecated, ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import type { HandlerParams, HandlerResult } from '@navios/core'

import { createUser, deleteUser, getUser, legacyEndpoint, listUsers, updateUser } from '../api.mjs'
import { UserService } from '../services/user.service.mjs'

@ApiTag('Users', 'User management operations')
@Controller()
export class UserController {
  private readonly userService = inject(UserService)

  @ApiOperation({
    summary: 'List all users',
    description: 'Retrieves a paginated list of users. Supports search filtering by name or email.',
    operationId: 'listUsers',
  })
  listUsers = handler(listUsers, ({ params }) => this.userService.findAll(params))

  // The 404 is declared in the endpoint's errorSchema, so it is documented
  // and reply(404, ...) is type-checked.
  @ApiSummary('Get user by ID')
  getUser = handler(getUser, async ({ urlParams }) => {
    const user = await this.userService.findById(urlParams.userId.toString())
    return user ?? reply(404, { message: 'User not found' })
  })

  @ApiOperation({
    summary: 'Create new user',
    description: 'Creates a new user with the provided data.',
  })
  @ApiSecurity({ bearerAuth: [] })
  createUser = handler(createUser, async ({ data }) =>
    reply(201, await this.userService.create(data)),
  )

  @ApiSummary('Update user')
  @ApiSecurity({ bearerAuth: [] })
  updateUser = handler(updateUser, async ({ urlParams, data }) => {
    const user = await this.userService.update(urlParams.userId.toString(), data)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  })

  @ApiSummary('Delete user')
  @ApiSecurity({ bearerAuth: [] })
  deleteUser = handler(deleteUser, async ({ urlParams }) => {
    const success = await this.userService.delete(urlParams.userId.toString())
    if (!success) {
      throw new NotFoundException('User not found')
    }
    return { success }
  })

  // The method form works too.
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
