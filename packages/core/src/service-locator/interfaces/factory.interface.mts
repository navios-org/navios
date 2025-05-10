export interface Factory<T> {
  create(ctx: any): Promise<T>
}
