export enum InjectableScope {
  /**
   * Singleton scope: The instance is created once and shared across the application.
   */
  Singleton = 'Singleton',
  /**
   * Instance scope: A new instance is created for each injection.
   */
  Instance = 'Instance',
}
