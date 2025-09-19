import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'

import { appEndpoint } from '../api/index.mjs'

@Controller()
export class AppController {
  @Endpoint(appEndpoint)
  async getHello(params: EndpointParams<typeof appEndpoint>) {
    return {
      message: 'Hello World',
    }
  }
}
