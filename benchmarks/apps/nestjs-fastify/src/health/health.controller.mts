import { Controller, Get } from '@nestjs/common'
import { getHealthResponse, getJsonResponse } from '../../../../shared/data.js'

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return getHealthResponse()
  }

  @Get('json')
  json() {
    return getJsonResponse()
  }
}
