import { Module } from '@navios/core/legacy-compat'

import { FilesController } from './files.controller.mjs'

@Module({
  controllers: [FilesController],
})
export class FilesModule {}
