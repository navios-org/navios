import { Controller, Endpoint, UseGuards } from '@navios/core'
import { inject } from '@navios/di'

import { statsEndpoint } from '../api.mjs'
import { AdminGuard } from './admin.guard.mjs'
import { StatsService } from './stats.service.mjs'

@UseGuards(AdminGuard)
@Controller()
export class AdminController {
  private readonly statsService = inject(StatsService)

  @Endpoint(statsEndpoint)
  getStats() {
    return this.statsService.getStats()
  }
}
