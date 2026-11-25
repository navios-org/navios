import { Module } from '@navios/server/legacy-compat'

import { ItemsModule } from '../items/items.module.mjs'

import { AppController } from './app.controller.mjs'

@Module({
  imports: [ItemsModule],
  controllers: [AppController],
})
export class AppModule {}
