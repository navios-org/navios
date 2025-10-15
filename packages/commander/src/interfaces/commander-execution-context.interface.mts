import type { CommandMetadata } from '../metadata/command.metadata.mjs'

export class CommanderExecutionContext {
  constructor(
    private readonly command: CommandMetadata,
    private readonly commandPath: string,
    private readonly options: any,
  ) {}

  getCommand(): CommandMetadata {
    return this.command
  }

  getCommandPath(): string {
    return this.commandPath
  }

  getOptions(): any {
    return this.options
  }
}
