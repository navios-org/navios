import { BetterAuthGuard } from '@navios/better-auth'
import { Module } from '@navios/server'

import { NotesController } from './notes/notes.controller.mjs'

@Module({
  controllers: [NotesController],
  guards: [BetterAuthGuard],
})
export class AppModule {}
