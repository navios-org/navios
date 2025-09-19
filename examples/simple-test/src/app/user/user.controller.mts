import type {
  EndpointParams,
  EndpointResult,
  MultipartParams,
} from '@navios/core'

import {
  Controller,
  Endpoint,
  inject,
  Logger,
  Multipart,
  UseGuards,
} from '@navios/core'

import {
  discriminatorEndpoint,
  multipartEndpoint,
  patchUserEndpoint,
  userEndpoint,
} from '../../api/index.mjs'
import { AclGuard } from '../acl/acl.guard.mjs'
import { OneMoreGuard } from '../acl/one-more.guard.mjs'
import { Public } from '../acl/public.attribute.mjs'
import { UserService } from './user.service.mjs'

@UseGuards(AclGuard)
@Controller()
export class UserController {
  userService = inject(UserService)
  logger = inject(Logger, {
    context: UserController.name,
  })

  @Public()
  @UseGuards(OneMoreGuard)
  @Endpoint(userEndpoint)
  async me(params: EndpointParams<typeof userEndpoint>) {
    this.logger.log(params)
    return this.userService.getUser()
  }

  @Endpoint(patchUserEndpoint)
  async patchMe(params: EndpointParams<typeof patchUserEndpoint>) {
    this.logger.log(params)
    return {
      ...this.userService.getUser(),
      ...params.data,
    }
  }

  @Endpoint(discriminatorEndpoint)
  async discriminator(
    params: EndpointParams<typeof discriminatorEndpoint>,
  ): EndpointResult<typeof discriminatorEndpoint> {
    this.logger.log(params)
    return {
      success: true,
      data: {
        id: '123',
        name: 'John Doe',
        email: 'test@example.com',
      },
    }
  }

  @Multipart(multipartEndpoint)
  async multipart(params: MultipartParams<typeof multipartEndpoint>) {
    this.logger.log(params)
    // params.data.
    return {}
  }
}
