import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint, NotFoundException } from '@navios/core'

import { healthEndpoint, notFoundEndpoint, protectedEndpoint, validationErrorEndpoint } from '../../api/endpoints.mjs'
import { Public } from '../../guards/public.attribute.mjs'

@Controller()
export class AppController {
  @Endpoint(healthEndpoint)
  @Public()
  async health(_params: EndpointParams<typeof healthEndpoint>) {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }

  @Endpoint(validationErrorEndpoint)
  @Public()
  async validationError(params: EndpointParams<typeof validationErrorEndpoint>) {
    // If we get here, validation passed
    return { success: true }
  }

  @Endpoint(notFoundEndpoint)
  @Public()
  async notFound(params: EndpointParams<typeof notFoundEndpoint>) {
    // Simulate not found
    throw new NotFoundException(`Resource with id ${params.urlParams.id} not found`)
  }

  @Endpoint(protectedEndpoint)
  // No @Public - requires authentication
  async protectedResource(_params: EndpointParams<typeof protectedEndpoint>) {
    return { data: 'secret data' }
  }
}
