import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller.mjs'
import { StatsService } from './stats.service.mjs'

@Module({
  controllers: [AdminController],
  providers: [StatsService],
})
export class AdminModule {}
