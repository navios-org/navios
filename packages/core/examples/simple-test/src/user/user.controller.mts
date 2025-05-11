import type { EndpointParams } from '../../../../src/index.mjs'

import {
  Controller,
  Endpoint,
  Logger,
  syncInject,
  UseGuards,
} from '../../../../src/index.mjs'
import { patchUserEndpoint, userEndpoint } from '../../api/index.mjs'
import { AclGuard } from '../acl/acl.guard.mjs'
import { OneMoreGuard } from '../acl/one-more.guard.mjs'
import { Public } from '../acl/public.attribute.mjs'
import { UserService } from './user.service.mjs'

@UseGuards(AclGuard)
@Controller()
export class UserController {
  userService = syncInject(UserService)
  logger = syncInject(Logger, {
    context: UserController.name,
  })

  @Public()
  @UseGuards(OneMoreGuard)
  @Endpoint(userEndpoint)
  me(params: EndpointParams<typeof userEndpoint>) {
    this.logger.log(params)
    return this.userService.getUser()
  }

  @Endpoint(patchUserEndpoint)
  patchMe(params: EndpointParams<typeof patchUserEndpoint>) {
    this.logger.log(params)
    return {
      ...this.userService.getUser(),
      ...params.data,
    }
  }
}
