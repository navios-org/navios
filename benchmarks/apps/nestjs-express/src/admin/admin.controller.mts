import { Controller, Get, UseGuards } from '@nestjs/common'
import { AdminGuard } from './admin.guard.mjs'
import { StatsService } from './stats.service.mjs'

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats')
  getStats() {
    return this.statsService.getStats()
  }
}
