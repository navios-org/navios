import { NotFoundException } from '@navios/server'
import { Controller, Endpoint } from '@navios/server/legacy-compat'

import type { HandlerParams, HandlerResult, RequestContext } from '@navios/server'

import {
  healthEndpoint,
  notFoundEndpoint,
  protectedEndpoint,
  validationErrorEndpoint,
  whoAmIEndpoint,
} from '../../api/endpoints.mjs'
import { CurrentUser } from '../../guards/current-user.mjs'
import { Public } from '../../guards/public.attribute.mjs'

// Legacy (experimentalDecorators) method decorators.
@Controller()
export class AppController {
  @Endpoint(healthEndpoint)
  @Public()
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  @Endpoint(validationErrorEndpoint)
  @Public()
  async validationError(_params: HandlerParams<typeof validationErrorEndpoint>) {
    // If we get here, validation passed
    return { success: true }
  }

  @Endpoint(notFoundEndpoint)
  @Public()
  async notFound(
    params: HandlerParams<typeof notFoundEndpoint>,
  ): HandlerResult<typeof notFoundEndpoint> {
    // Simulate not found
    throw new NotFoundException(`Resource with id ${params.urlParams.id} not found`)
  }

  @Endpoint(protectedEndpoint)
  // No @Public - requires authentication
  async protectedResource() {
    return { data: 'secret data' }
  }

  @Endpoint(whoAmIEndpoint)
  async whoAmI(_params: HandlerParams<typeof whoAmIEndpoint>, ctx: RequestContext) {
    return ctx.get(CurrentUser)
  }
}
