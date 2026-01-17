import { Module } from '@navios/core/legacy-compat'

import { ItemsController } from './items.controller.mjs'
import { ItemsService } from './items.service.mjs'
import { ProcessingService } from './processing.service.mjs'

@Module({
  controllers: [ItemsController],
  services: [ItemsService, ProcessingService],
})
export class ItemsModule {}
