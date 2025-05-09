import type { EndpointParams } from '../../../../src/index.mjs'

import { Controller, Endpoint, syncInject } from '../../../../src/index.mjs'
import { patchUserEndpoint, userEndpoint } from '../../api/index.mjs'
import { UserService } from './user.service.mjs'

@Controller()
export class UserController {
  userService = syncInject(UserService)

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
