import type { EndpointParams } from '../../../src/index.mjs'

import { Controller, Endpoint } from '../../../src/index.mjs'
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
