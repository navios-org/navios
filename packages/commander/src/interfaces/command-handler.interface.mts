export interface CommandHandler<TOptions = any> {
  execute(options: TOptions): void | Promise<void>
}
