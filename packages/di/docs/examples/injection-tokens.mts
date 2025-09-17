/**
 * Injection Tokens Example
 *
 * This example demonstrates:
 * - Creating injection tokens with schemas
 * - Using bound injection tokens
 * - Using factory injection tokens
 * - Token-based dependency resolution
 */

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

const container = new Container()

// 1. Define schemas for configuration
const databaseConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string(),
})

const emailConfigSchema = z.object({
  provider: z.enum(['smtp', 'sendgrid', 'ses']),
  apiKey: z.string(),
  fromEmail: z.string().email(),
})

// 2. Create injection tokens
const DB_CONFIG_TOKEN = InjectionToken.create<
  DatabaseConfigService,
  typeof databaseConfigSchema
>('DB_CONFIG', databaseConfigSchema)

const EMAIL_CONFIG_TOKEN = InjectionToken.create<
  EmailConfigService,
  typeof emailConfigSchema
>('EMAIL_CONFIG', emailConfigSchema)

// 3. Create services that use injection tokens
@Injectable({ token: DB_CONFIG_TOKEN })
class DatabaseConfigService {
  constructor(private config: z.infer<typeof databaseConfigSchema>) {}

  getConnectionString() {
    return `postgresql://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`
  }

  getHost() {
    return this.config.host
  }

  getPort() {
    return this.config.port
  }
}

@Injectable({ token: EMAIL_CONFIG_TOKEN })
class EmailConfigService {
  constructor(private config: z.infer<typeof emailConfigSchema>) {}

  getProvider() {
    return this.config.provider
  }

  getApiKey() {
    return this.config.apiKey
  }

  getFromEmail() {
    return this.config.fromEmail
  }
}

// 4. Create bound tokens for different environments
const PRODUCTION_DB_CONFIG = InjectionToken.bound(DB_CONFIG_TOKEN, {
  host: 'prod-db.example.com',
  port: 5432,
  database: 'production',
  username: 'prod_user',
  password: 'prod_password',
})

const DEVELOPMENT_DB_CONFIG = InjectionToken.bound(DB_CONFIG_TOKEN, {
  host: 'localhost',
  port: 5432,
  database: 'development',
  username: 'dev_user',
  password: 'dev_password',
})

const PRODUCTION_EMAIL_CONFIG = InjectionToken.bound(EMAIL_CONFIG_TOKEN, {
  provider: 'sendgrid',
  apiKey: 'sg.prod_key',
  fromEmail: 'noreply@example.com',
})

const DEVELOPMENT_EMAIL_CONFIG = InjectionToken.bound(EMAIL_CONFIG_TOKEN, {
  provider: 'smtp',
  apiKey: 'smtp_dev_key',
  fromEmail: 'dev@example.com',
})

// 5. Create factory tokens for dynamic configuration
const DYNAMIC_DB_CONFIG = InjectionToken.factory(DB_CONFIG_TOKEN, async () => {
  const env = process.env.NODE_ENV || 'development'

  if (env === 'production') {
    return {
      host: 'prod-db.example.com',
      port: 5432,
      database: 'production',
      username: 'prod_user',
      password: 'prod_password',
    }
  } else {
    return {
      host: 'localhost',
      port: 5432,
      database: 'development',
      username: 'dev_user',
      password: 'dev_password',
    }
  }
})

const DYNAMIC_EMAIL_CONFIG = InjectionToken.factory(
  EMAIL_CONFIG_TOKEN,
  async () => {
    const env = process.env.NODE_ENV || 'development'

    if (env === 'production') {
      return {
        provider: 'sendgrid' as const,
        apiKey: 'sg.prod_key',
        fromEmail: 'noreply@example.com',
      }
    } else {
      return {
        provider: 'smtp' as const,
        apiKey: 'smtp_dev_key',
        fromEmail: 'dev@example.com',
      }
    }
  },
)

// 6. Usage examples
async function demonstrateBoundTokens() {
  console.log('=== Bound Tokens Example ===\n')

  // Use production configuration
  const prodDbConfig = await container.get(PRODUCTION_DB_CONFIG)
  console.log('Production DB:', prodDbConfig.getConnectionString())

  const prodEmailConfig = await container.get(PRODUCTION_EMAIL_CONFIG)
  console.log('Production Email:', prodEmailConfig.getProvider())

  // Use development configuration
  const devDbConfig = await container.get(DEVELOPMENT_DB_CONFIG)
  console.log('Development DB:', devDbConfig.getConnectionString())

  const devEmailConfig = await container.get(DEVELOPMENT_EMAIL_CONFIG)
  console.log('Development Email:', devEmailConfig.getProvider())
}

async function demonstrateFactoryTokens() {
  console.log('\n=== Factory Tokens Example ===\n')

  // Use dynamic configuration based on environment
  const dbConfig = await container.get(DYNAMIC_DB_CONFIG)
  console.log('Dynamic DB:', dbConfig.getConnectionString())

  const emailConfig = await container.get(DYNAMIC_EMAIL_CONFIG)
  console.log('Dynamic Email:', emailConfig.getProvider())
}

async function demonstrateDirectTokens() {
  console.log('\n=== Direct Tokens Example ===\n')

  // Use tokens directly with configuration
  const dbConfig = await container.get(DB_CONFIG_TOKEN, {
    host: 'custom-db.example.com',
    port: 5432,
    database: 'custom',
    username: 'custom_user',
    password: 'custom_password',
  })
  console.log('Custom DB:', dbConfig.getConnectionString())

  const emailConfig = await container.get(EMAIL_CONFIG_TOKEN, {
    provider: 'ses',
    apiKey: 'aws_ses_key',
    fromEmail: 'custom@example.com',
  })
  console.log('Custom Email:', emailConfig.getProvider())
}

// Main function
async function main() {
  await demonstrateBoundTokens()
  await demonstrateFactoryTokens()
  await demonstrateDirectTokens()
}

// Run the example
if (require.main === module) {
  main().catch(console.error)
}

export {
  DB_CONFIG_TOKEN,
  EMAIL_CONFIG_TOKEN,
  PRODUCTION_DB_CONFIG,
  DEVELOPMENT_DB_CONFIG,
  PRODUCTION_EMAIL_CONFIG,
  DEVELOPMENT_EMAIL_CONFIG,
  DYNAMIC_DB_CONFIG,
  DYNAMIC_EMAIL_CONFIG,
  DatabaseConfigService,
  EmailConfigService,
}
