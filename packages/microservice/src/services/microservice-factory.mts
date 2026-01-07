import type { ClassType } from '@navios/di'

import { Container } from '@navios/di'

import type { NaviosModule } from '@navios/core'

import { MessageHandlerService } from './message-handler.service.mjs'

/**
 * Factory class for creating and configuring Navios microservices.
 *
 * Similar to NaviosFactory but for message-based microservices.
 * It handles dependency injection container setup, queue client initialization,
 * and message handler registration.
 *
 * @example
 * ```typescript
 * import { MicroserviceFactory } from '@navios/microservice'
 *
 * const microservice = await MicroserviceFactory.create(AppMessageModule)
 *
 * await microservice.start()
 * ```
 */
export class MicroserviceFactory {
  /**
   * Creates a new Navios microservice instance.
   *
   * This method sets up the dependency injection container, initializes the queue client,
   * and discovers message handlers from the provided module.
   *
   * @param appModule - The root message module class decorated with @MessageModule()
   * @param options - Optional configuration options
   * @param options.container - Optional custom dependency injection container (useful for testing)
   * @returns A configured Microservice instance ready to be started
   */
  static async create(
    appModule: ClassType,
    options: {
      container?: Container
    } = {},
  ) {
    const container = options.container ?? new Container()

    // Get message handler service
    const handlerService = await container.get(MessageHandlerService)

    // Discover and register handlers
    await handlerService.discoverHandlers(appModule, container)

    return {
      container,
      handlerService,
      async start() {
        // TODO: Start listening for messages
        throw new Error('Microservice start not yet implemented')
      },
      async stop() {
        // TODO: Stop listening and disconnect from queue
        throw new Error('Microservice stop not yet implemented')
      },
    }
  }
}

