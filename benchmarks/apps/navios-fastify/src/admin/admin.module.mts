import { Module } from '@navios/core'
import { AdminController } from './admin.controller.mjs'

@Module({
  controllers: [AdminController],
})
export class AdminModule {}
