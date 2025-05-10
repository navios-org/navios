export interface NaviosModule {
  onModuleInit?: () => Promise<void> | void
}
