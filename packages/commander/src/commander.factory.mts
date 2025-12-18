import type { ClassTypeWithInstance, NaviosModule } from '@navios/core'

import { Container } from '@navios/core'

import type { CommanderApplicationOptions } from './commander.application.mjs'

import { CommanderApplication } from './commander.application.mjs'

export class CommanderFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: CommanderApplicationOptions = {},
  ) {
    const container = new Container()
    const app = await container.get(CommanderApplication)
    await app.setup(appModule, options)
    return app
  }
}
