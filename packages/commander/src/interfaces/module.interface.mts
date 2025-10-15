export interface Module {
  onModuleInit?(): void | Promise<void>
  onModuleDestroy?(): void | Promise<void>
}
