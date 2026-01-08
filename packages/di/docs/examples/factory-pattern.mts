import type { Factorable, FactorableWithArgs, FactoryContext } from '@navios/di'

import {
  Container,
  Factory,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
} from '@navios/di'

import { z } from 'zod'

const container = new Container()

/**
 * Factory Pattern Example
 *
 * This example demonstrates:
 * - Using @Factory decorator
 * - Factory with dependencies
 * - Factory with configuration
 * - Factory with different scopes
 */

// 1. Simple factory without dependencies
@Factory()
class RandomIdFactory {
  create() {
    return {
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
    }
  }
}

// 2. Factory with dependencies
@Injectable()
class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${message}`)
  }
}

@Factory()
class DatabaseConnectionFactory {
  private readonly logger = inject(LoggerService)

  create() {
    this.logger.log('Creating database connection...')

    return {
      host: 'localhost',
      port: 5432,
      connected: false,
      connect: async () => {
        this.logger.log('Connecting to database...')
        await new Promise((resolve) => setTimeout(resolve, 100))
        this.logger.log('Database connected successfully')
        return { connected: true }
      },
      disconnect: async () => {
        this.logger.log('Disconnecting from database...')
        return { connected: false }
      },
    }
  }
}

// 3. Factory with configuration schema
const emailConfigSchema = z.object({
  provider: z.enum(['smtp', 'sendgrid', 'ses']),
  apiKey: z.string(),
  fromEmail: z.string().email(),
})

type EmailConfig = z.infer<typeof emailConfigSchema>

interface EmailService {
  sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean; provider: string }>
}

const EMAIL_CONFIG_TOKEN = InjectionToken.create<
  EmailService,
  typeof emailConfigSchema
>('EMAIL_CONFIG', emailConfigSchema)

@Factory({ token: EMAIL_CONFIG_TOKEN })
class EmailServiceFactory
  implements FactorableWithArgs<EmailService, typeof emailConfigSchema>
{
  create(ctx: FactoryContext, config: z.infer<typeof emailConfigSchema>) {
    switch (config.provider) {
      case 'smtp':
        return new SmtpEmailService(config)
      case 'sendgrid':
        return new SendGridEmailService(config)
      case 'ses':
        return new SesEmailService(config)
      default:
        throw new Error(`Unsupported email provider: ${config.provider}`)
    }
  }
}

// Email service implementations
class SmtpEmailService implements EmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, _body: string) {
    console.log(`SMTP email sent to ${to}: ${subject}`)
    return { success: true, provider: 'smtp' }
  }
}

class SendGridEmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, _body: string) {
    console.log(`SendGrid email sent to ${to}: ${subject}`)
    return { success: true, provider: 'sendgrid' }
  }
}

class SesEmailService {
  constructor(private config: EmailConfig) {}

  async sendEmail(to: string, subject: string, _body: string) {
    console.log(`SES email sent to ${to}: ${subject}`)
    return { success: true, provider: 'ses' }
  }
}

// 4. Factory with transient scope

interface UserSession {
  sessionId: string
  userId: string | null
  loginTime: Date
  isActive: boolean
  login(userId: string): void
  logout(): void
  getSessionInfo(): Pick<
    UserSession,
    'sessionId' | 'userId' | 'loginTime' | 'isActive'
  >
}

@Factory({ scope: InjectableScope.Transient })
class UserSessionFactory implements Factorable<UserSession> {
  create() {
    return {
      sessionId: Math.random().toString(36),
      userId: null,
      loginTime: new Date(),
      isActive: false,

      login(userId: string) {
        this.userId = userId
        this.isActive = true
        this.loginTime = new Date()
      },

      logout() {
        this.userId = null
        this.isActive = false
      },

      getSessionInfo() {
        return {
          sessionId: this.sessionId,
          userId: this.userId,
          loginTime: this.loginTime,
          isActive: this.isActive,
        }
      },
    } satisfies UserSession
  }
}

// 5. Factory with complex object creation
@Injectable()
class ConfigService {
  getDatabaseConfig() {
    return {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
    }
  }

  getCacheConfig() {
    return {
      host: 'localhost',
      port: 6379,
      ttl: 3600,
    }
  }
}

@Factory()
class ApplicationContextFactory {
  private readonly config = inject(ConfigService)

  create() {
    const dbConfig = this.config.getDatabaseConfig()
    const cacheConfig = this.config.getCacheConfig()

    return {
      database: {
        ...dbConfig,
        connectionString: `postgresql://${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
      },
      cache: {
        ...cacheConfig,
        connectionString: `redis://${cacheConfig.host}:${cacheConfig.port}`,
      },
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      initializedAt: new Date(),
    }
  }
}

// 6. Usage examples
async function demonstrateSimpleFactory() {
  console.log('=== Simple Factory Example ===\n')

  const idFactory = await container.get(RandomIdFactory)
  console.log('Generated ID:', idFactory)
}

async function demonstrateFactoryWithDependencies() {
  console.log('\n=== Factory with Dependencies Example ===\n')

  const dbFactory = await container.get(DatabaseConnectionFactory)
  console.log('Database connection:', dbFactory)

  const connection = await dbFactory.connect()
  console.log('Connection result:', connection)
}

async function demonstrateFactoryWithConfiguration() {
  console.log('\n=== Factory with Configuration Example ===\n')

  // Create different email services based on configuration
  const smtpEmail = await container.get(EMAIL_CONFIG_TOKEN, {
    provider: 'smtp',
    apiKey: 'smtp_key',
    fromEmail: 'noreply@example.com',
  })

  const sendgridEmail = await container.get(EMAIL_CONFIG_TOKEN, {
    provider: 'sendgrid',
    apiKey: 'sg_key',
    fromEmail: 'noreply@example.com',
  })

  await smtpEmail.sendEmail('user@example.com', 'Test', 'Hello from SMTP')
  await sendgridEmail.sendEmail(
    'user@example.com',
    'Test',
    'Hello from SendGrid',
  )
}

async function demonstrateTransientFactory() {
  console.log('\n=== Transient Factory Example ===\n')

  // Create multiple sessions
  const session1 = await container.get(UserSessionFactory)
  const session2 = await container.get(UserSessionFactory)

  session1.login('user1')
  session2.login('user2')

  console.log('Session 1:', session1.getSessionInfo())
  console.log('Session 2:', session2.getSessionInfo())

  // Verify they are different instances
  console.log('Different sessions:', session1.sessionId !== session2.sessionId)
}

async function demonstrateComplexFactory() {
  console.log('\n=== Complex Factory Example ===\n')

  const appContext = await container.get(ApplicationContextFactory)
  console.log('Application context:', JSON.stringify(appContext, null, 2))
}

// Main function
async function main() {
  await demonstrateSimpleFactory()
  await demonstrateFactoryWithDependencies()
  await demonstrateFactoryWithConfiguration()
  await demonstrateTransientFactory()
  await demonstrateComplexFactory()
}

// Run the example
if (require.main === module) {
  main().catch(console.error)
}

export {
  RandomIdFactory,
  DatabaseConnectionFactory,
  EmailServiceFactory,
  UserSessionFactory,
  ApplicationContextFactory,
  SmtpEmailService,
  SendGridEmailService,
  SesEmailService,
}
