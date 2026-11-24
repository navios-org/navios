import { openApiPlugin } from '@navios/openapi'

/**
 * The same plugin serves the document and the Scalar page on every adapter:
 *
 * - GET /docs          Scalar API reference
 * - GET /openapi.json  the document
 * - GET /openapi.yaml  the document as YAML (off by default)
 */
export const openApi = openApiPlugin({
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
  disableYaml: false,
})

export function printBanner(url: string): void {
  console.log('')
  console.log('='.repeat(60))
  console.log('  Navios OpenAPI Example Server')
  console.log('='.repeat(60))
  console.log('')
  console.log(`  Server:       ${url}`)
  console.log(`  API Docs:     ${url}/docs`)
  console.log(`  OpenAPI JSON: ${url}/openapi.json`)
  console.log(`  OpenAPI YAML: ${url}/openapi.yaml`)
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
