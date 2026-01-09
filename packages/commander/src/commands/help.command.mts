import { inject, Logger } from '@navios/core'

import { z } from 'zod'

import type { CommandHandler } from '../interfaces/command-handler.interface.mjs'

import { Command } from '../decorators/command.decorator.mjs'
import { CommandRegistryService } from '../services/command-registry.service.mjs'

const helpOptionsSchema = z.object({
  command: z.string().optional(),
})

type HelpOptions = z.infer<typeof helpOptionsSchema>

/**
 * Built-in help command that lists all available commands or shows help for a specific command.
 *
 * @public
 */
@Command({
  path: 'help',
  description: 'Show available commands or help for a specific command',
  optionsSchema: helpOptionsSchema,
})
export class HelpCommand implements CommandHandler<HelpOptions> {
  private logger = inject(Logger, { context: 'Commander' })
  private commandRegistry = inject(CommandRegistryService)

  async execute(options: HelpOptions): Promise<void> {
    if (options.command) {
      this.logger.log(this.commandRegistry.formatCommandHelp(options.command))
    } else {
      this.logger.log(this.commandRegistry.formatCommandList())
    }
  }
}
