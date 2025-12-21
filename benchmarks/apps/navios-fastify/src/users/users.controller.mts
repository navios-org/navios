import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint, HttpCode } from '@navios/core'
import { inject } from '@navios/di'

import { createUserEndpoint, getUserEndpoint } from '../api.mjs'
import { UsersService } from './users.service.mjs'

@Controller()
export class UsersController {
  private readonly usersService = inject(UsersService)

  @Endpoint(getUserEndpoint)
  getUser(params: EndpointParams<typeof getUserEndpoint>) {
    return this.usersService.getById(params.urlParams.userId)
  }

  @Endpoint(createUserEndpoint)
  @HttpCode(201)
  createUser(params: EndpointParams<typeof createUserEndpoint>) {
    return this.usersService.create(params.data)
  }
}
