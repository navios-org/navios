import type { EndpointParams } from '@navios/server'

import { Controller, Endpoint } from '@navios/server'

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
