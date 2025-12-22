export enum InjectableScope {
  /**
   * Singleton scope: The instance is created once and shared across the application.
   */
  Singleton = 'Singleton',
  /**
   * Instance scope: A new instance is created for each injection.
   */
  Transient = 'Transient',
  /**
   * Request scope: The instance is created once per request and shared within that request context.
   */
  Request = 'Request',
}

