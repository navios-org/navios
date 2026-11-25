import { Controller, Endpoint } from '@navios/server'

import { appEndpoint } from '../api/index.mjs'

@Controller()
export class AppController {
  @Endpoint(appEndpoint)
  async getHello() {
    return { message: 'Hello World' }
  }
}
