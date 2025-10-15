import type { ClassTypeWithInstance } from '@navios/di'

import { Container } from '@navios/di'

import type { CommanderApplicationOptions } from './commander.application.mjs'
import type { Module } from './interfaces/index.mjs'

import { CommanderApplication } from './commander.application.mjs'

export class CommanderFactory {
  static async create(
    appModule: ClassTypeWithInstance<Module>,
    options: CommanderApplicationOptions = {},
  ) {
    const container = new Container()
    const app = await container.get(CommanderApplication)
    await app.setup(appModule, options)
    return app
  }
}
