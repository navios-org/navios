import { Module } from '@navios/server'

import { FilesController } from './files.controller.mjs'

@Module({
  controllers: [FilesController],
})
export class FilesModule {}
