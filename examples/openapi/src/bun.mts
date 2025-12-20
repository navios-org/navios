import { defineBunEnvironment } from '@navios/adapter-bun'
import { Module, NaviosFactory } from '@navios/core'
import { defineOpenApiPlugin } from '@navios/openapi-bun'

import { HealthController } from './controllers/health.controller.mjs'
import { PostController } from './controllers/post.controller.mjs'
import { UserController } from './controllers/user.controller.mjs'

@Module({
  controllers: [UserController, PostController, HealthController],
})
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
    logger: ['log', 'error', 'warn'],
  })

  // Register the OpenAPI plugin
  app.usePlugin(
    defineOpenApiPlugin({
      info: {
        title: 'Navios OpenAPI Example',
        version: '1.0.0',
        description:
          'A comprehensive example demonstrating OpenAPI documentation generation with Navios.',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication',
        },
      },
      tags: [
        { name: 'Users', description: 'User management operations' },
        { name: 'Posts', description: 'Blog post operations' },
        { name: 'Legacy', description: 'Deprecated endpoints' },
      ],
      scalar: {
        theme: 'purple',
      },
      disableYaml: false, // Enable YAML endpoint
    }),
  )

  await app.init()

  await app.listen({ port: 3000 })

  console.log('')
  console.log('='.repeat(60))
  console.log('  Navios OpenAPI Example Server')
  console.log('='.repeat(60))
  console.log('')
  console.log('  Server:      http://localhost:3000')
  console.log('  API Docs:    http://localhost:3000/docs')
  console.log('  OpenAPI JSON: http://localhost:3000/openapi.json')
  console.log('  OpenAPI YAML: http://localhost:3000/openapi.yaml')
  console.log('')
  console.log('  Endpoints:')
  console.log('    GET    /users          - List users')
  console.log('    GET    /users/:id      - Get user by ID')
  console.log('    POST   /users          - Create user')
  console.log('    PATCH  /users/:id      - Update user')
  console.log('    DELETE /users/:id      - Delete user')
  console.log('    GET    /posts          - List posts')
  console.log('    GET    /posts/:id      - Get post by ID')
  console.log('    POST   /posts          - Create post')
  console.log('    GET    /v1/users       - Legacy (deprecated)')
  console.log('')
  console.log('='.repeat(60))
}

bootstrap().catch(console.error)
