import { Module } from '@navios/core/legacy-compat'

import { ItemsController } from './items.controller.mjs'

// ItemsService and ProcessingService are `@Injectable()` and resolved through
// `inject()` in the controller, so they need no registration here.
@Module({
  controllers: [ItemsController],
})
export class ItemsModule {}
