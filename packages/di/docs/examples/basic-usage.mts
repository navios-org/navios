/**
 * Basic Usage Example
 *
 * This example demonstrates the fundamental concepts of Navios DI:
 * - Service registration with @Injectable
 * - Dependency injection with asyncInject and inject
 * - Container usage
 */

import { asyncInject, Container, inject, Injectable } from '@navios/di'

// 1. Create a simple service
@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${new Date().toISOString()} - ${message}`)
  }
}

// 2. Create a service that depends on LoggerService
@Injectable()
class UserService {
  private readonly logger = inject(LoggerService)

  createUser(name: string, email: string) {
    this.logger.log(`Creating user: ${name}`)
    return { id: Math.random().toString(36), name, email }
  }
}

// 3. Create a service that uses async injection
@Injectable()
class EmailService {
  private readonly logger = asyncInject(LoggerService)

  async sendEmail(to: string, _subject: string, _body: string) {
    const logger = await this.logger
    logger.log(`Sending email to ${to}`)

    // Simulate email sending
    await new Promise((resolve) => setTimeout(resolve, 100))

    return { success: true, messageId: Math.random().toString(36) }
  }
}

// 4. Create a service that orchestrates other services
@Injectable()
class UserRegistrationService {
  private readonly userService = inject(UserService)
  private readonly emailService = inject(EmailService)
  private readonly logger = inject(LoggerService)

  async registerUser(name: string, email: string) {
    this.logger.log(`Starting user registration for ${name}`)

    // Create user
    const user = this.userService.createUser(name, email)

    // Send welcome email
    await this.emailService.sendEmail(
      email,
      'Welcome!',
      `Hello ${name}, welcome to our platform!`,
    )

    this.logger.log(`User registration completed for ${name}`)

    return user
  }
}

// 5. Usage example
async function main() {
  console.log('=== Basic Usage Example ===\n')

  // Create container
  const container = new Container()

  // Get the registration service (all dependencies will be automatically injected)
  const registrationService = await container.get(UserRegistrationService)

  // Register a user
  const user = await registrationService.registerUser(
    'Alice',
    'alice@example.com',
  )

  console.log('\nRegistered user:', user)
}

// Run the example
if (require.main === module) {
  main().catch(console.error)
}

export { LoggerService, UserService, EmailService, UserRegistrationService }
