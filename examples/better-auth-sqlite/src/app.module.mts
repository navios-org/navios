import { Module } from '@navios/server'

import { NotesController } from './notes/notes.controller.mjs'

@Module({ controllers: [NotesController] })
export class AppModule {}
