import { Module } from '@navios/server/legacy-compat'

import { FilesController } from './files.controller.mjs'

@Module({
  controllers: [FilesController],
})
export class FilesModule {}
