import { Controller, Endpoint, inject, UseGuards } from '@navios/server'

import type { HandlerParams } from '@navios/server'

import {
  discriminatorEndpoint,
  multipartEndpoint,
  patchUserEndpoint,
  userEndpoint,
} from '../../api/index.mjs'
import { AclGuard } from '../acl/acl.guard.mjs'
import { Public, Roles } from '../acl/attributes.mjs'

import { UserService } from './user.service.mjs'

@UseGuards(AclGuard)
@Controller()
export class UserController {
  private readonly userService = inject(UserService)

  @Public()
  @Endpoint(userEndpoint)
  async me() {
    return this.userService.getUser()
  }

  @Roles({ roles: ['USER', 'ADMIN'] })
  @Endpoint(patchUserEndpoint)
  async patchMe({ data }: HandlerParams<typeof patchUserEndpoint>) {
    return { ...this.userService.getUser(), ...data }
  }

  @Endpoint(discriminatorEndpoint)
  async discriminator() {
    return { success: true as const, data: this.userService.getUser() }
  }

  @Endpoint(multipartEndpoint)
  async multipart({ data }: HandlerParams<typeof multipartEndpoint>) {
    return { names: data.files.map((file) => file.name) }
  }
}
