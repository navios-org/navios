import { Controller, Endpoint } from '@navios/core'

import { getHealthResponse, getJsonResponse } from '../../../../shared/data.js'
import { healthEndpoint, jsonEndpoint } from '../api.mjs'

@Controller()
export class HealthController {
  @Endpoint(healthEndpoint)
  health() {
    return getHealthResponse()
  }

  @Endpoint(jsonEndpoint)
  json() {
    return getJsonResponse()
  }
}
