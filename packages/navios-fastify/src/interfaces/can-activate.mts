export interface CanActivate {
  canActivate(request: unknown, reply: unknown): Promise<boolean> | boolean
}
