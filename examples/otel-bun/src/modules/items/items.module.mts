import { Module } from '@navios/core'

import { ItemsController } from './items.controller.mjs'

@Module({
  controllers: [ItemsController],
})
export class ItemsModule {}
