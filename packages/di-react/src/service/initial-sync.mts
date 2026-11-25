/**
 * The instance a service hook read synchronously during its first render,
 * with the container, token and args it was read for.
 */
export interface InitialSync {
  container: object
  token: object
  argsKey: string
  instance: unknown
}
