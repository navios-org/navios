import type { EndpointParams } from '../../../../src/index.mjs'

import {
  Controller,
  Endpoint,
  syncInject,
  UseGuards,
} from '../../../../src/index.mjs'
import { patchUserEndpoint, userEndpoint } from '../../api/index.mjs'
import { AclGuard } from '../acl/acl.guard.mjs'
import { OneMoreGuard } from '../acl/one-more.guard.mjs'
import { UserService } from './user.service.mjs'

@UseGuards(AclGuard)
@Controller()
export class UserController {
  userService = syncInject(UserService)

  @UseGuards(OneMoreGuard)
  @Endpoint(userEndpoint)
  me(params: EndpointParams<typeof userEndpoint>) {
    console.log(params)
    return this.userService.getUser()
  }

  @Endpoint(patchUserEndpoint)
  patchMe(params: EndpointParams<typeof patchUserEndpoint>) {
    console.log(params)
    return {
      ...this.userService.getUser(),
      ...params.data,
    }
  }
}
