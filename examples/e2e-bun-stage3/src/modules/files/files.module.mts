import { Module } from '@navios/core'

import { FilesController } from './files.controller.mjs'

@Module({
  controllers: [FilesController],
})
export class FilesModule {}
