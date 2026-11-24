import { builder } from '@navios/builder'
import { Controller, Endpoint, handler, Module, reply } from '@navios/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { StandardSchemaV1 } from '@navios/core'

import {
  ApiDeprecated,
  ApiExclude,
  ApiOperation,
  ApiSecurity,
  ApiStream,
  ApiSummary,
  ApiTag,
  generateOpenApiDocument,
} from '../index.mjs'

import { closeApps, createAppFromModule, documentOf, operation, silent } from './helpers.mjs'

const api = builder()

const userSchema = z.object({ id: z.string(), name: z.string() })
const errorSchema = z.object({ message: z.string() })

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: { 404: errorSchema },
})
const listUsers = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().optional().meta({ description: 'Page number' }),
    search: z.string(),
  }),
  responseSchema: z.array(userSchema),
})
const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string() }),
  responses: { 201: userSchema },
})
const info = { title: 'Test API', version: '1.0.0' }

afterEach(closeApps)

describe('generateOpenApiDocument', () => {
  it('generates a basic document', async () => {
    const document = await documentOf([])
    expect(document).toEqual({ openapi: '3.1.0', info, paths: {} })
  })

  it('includes optional info fields', async () => {
    const fullInfo = {
      title: 'Test API',
      version: '1.0.0',
      description: 'A test API',
      termsOfService: 'https://example.com/terms',
      contact: { name: 'Support', url: 'https://example.com', email: 'support@example.com' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    }
    expect((await documentOf([], { info: fullInfo })).info).toEqual(fullInfo)
  })

  it('includes servers when provided, and not for an empty list', async () => {
    const servers = [{ url: 'https://api.example.com', description: 'Production' }]
    expect((await documentOf([], { servers })).servers).toEqual(servers)
    expect(await documentOf([], { servers: [] })).not.toHaveProperty('servers')
  })

  it('includes external docs when provided', async () => {
    const externalDocs = { url: 'https://docs.example.com', description: 'Docs' }
    expect((await documentOf([], { externalDocs })).externalDocs).toEqual(externalDocs)
  })

  it('includes security schemes and global security requirements', async () => {
    const document = await documentOf([], {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      security: [{ bearerAuth: [] }],
    })
    expect(document.components?.securitySchemes).toEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    })
    expect(document.security).toEqual([{ bearerAuth: [] }])
  })

  it('builds paths from routes in both handler forms and merges methods of one path', async () => {
    @Controller()
    class UsersController {
      @Endpoint(getUser)
      async getUser() {
        return { id: '1', name: 'Ann' }
      }

      listUsers = handler(listUsers, () => [])

      createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
    }

    const document = await documentOf([UsersController])
    expect(Object.keys(document.paths).sort()).toEqual(['/users', '/users/{userId}'])
    expect(Object.keys(document.paths['/users']).sort()).toEqual(['get', 'post'])
    expect(Object.keys(document.paths['/users/{userId}'])).toEqual(['get'])
  })

  it('uses the full route path: global prefix and module prefix', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))
    }

    @Module({ prefix: '/v1', controllers: [UsersController] })
    class AppModule {}

    const app = await createAppFromModule(AppModule, { globalPrefix: '/api' })
    const document = generateOpenApiDocument(app.routes(), { info, logger: silent })
    expect(Object.keys(document.paths)).toEqual(['/api/v1/users/{userId}'])
  })

  it('leaves out excluded routes', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))

      @ApiExclude()
      listUsers = handler(listUsers, () => [])
    }

    @ApiExclude()
    @Controller()
    class HiddenController {
      createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
    }

    const document = await documentOf([UsersController, HiddenController])
    expect(document.paths).toHaveProperty('/users/{userId}')
    expect(document.paths).not.toHaveProperty('/users')
  })

  it('collects tags from routes and merges them with configured tags', async () => {
    @ApiTag('Users', 'From the attribute')
    @Controller()
    class UsersController {
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))

      @ApiTag('Lists', 'Collections')
      listUsers = handler(listUsers, () => [])
    }

    const document = await documentOf([UsersController], {
      tags: [
        { name: 'Users', description: 'User operations' },
        { name: 'Extra', description: 'Configured only' },
      ],
    })
    expect(document.tags).toEqual([
      { name: 'Users', description: 'User operations' },
      { name: 'Extra', description: 'Configured only' },
      { name: 'Lists', description: 'Collections' },
    ])
    expect(operation(document, 'get', '/users').tags).toEqual(['Users', 'Lists'])
  })

  it('has no tags when none are discovered or configured', async () => {
    @Controller()
    class UsersController {
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))
    }

    const document = await documentOf([UsersController])
    expect(document).not.toHaveProperty('tags')
    expect(operation(document, 'get', '/users/{userId}')).not.toHaveProperty('tags')
  })

  it('logs what it generated', async () => {
    const logger = { warn: vi.fn(), debug: vi.fn() }
    await documentOf([], { logger })
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('0 operation(s)'))
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('writes operation metadata from the attributes', async () => {
    @Controller()
    class UsersController {
      @ApiOperation({
        summary: 'Get a user',
        description: 'By id',
        operationId: 'getUserById',
        externalDocs: { url: 'https://docs.example.com' },
      })
      @ApiSecurity({ bearerAuth: [] })
      @ApiDeprecated('Use v2')
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))

      listUsers = handler(listUsers, { attributes: [ApiSummary('List users')] }, () => [])
    }

    const document = await documentOf([UsersController])
    expect(operation(document, 'get', '/users/{userId}')).toMatchObject({
      summary: 'Get a user',
      description: 'By id',
      operationId: 'getUserById',
      externalDocs: { url: 'https://docs.example.com' },
      security: [{ bearerAuth: [] }],
      deprecated: true,
    })
    const list = operation(document, 'get', '/users')
    expect(list.summary).toBe('List users')
    expect(list).not.toHaveProperty('deprecated')
    expect(list).not.toHaveProperty('security')
  })

  it('writes the message of ApiDeprecated as x-deprecated-message', async () => {
    @Controller()
    class UsersController {
      @ApiOperation({ description: 'By id' })
      @ApiDeprecated('Use GET /v2/users/{userId}')
      getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))

      @ApiDeprecated()
      listUsers = handler(listUsers, () => [])
    }

    @Module({ controllers: [UsersController], attributes: [ApiDeprecated('Use the v2 API')] })
    class LegacyModule {}

    const document = await documentOf([UsersController])
    expect(operation(document, 'get', '/users/{userId}')).toMatchObject({
      deprecated: true,
      description: 'By id',
      'x-deprecated-message': 'Use GET /v2/users/{userId}',
    })
    const list = operation(document, 'get', '/users')
    expect(list.deprecated).toBe(true)
    expect(list).not.toHaveProperty('x-deprecated-message')

    // The most specific ApiDeprecated wins, message included.
    const inherited = generateOpenApiDocument((await createAppFromModule(LegacyModule)).routes(), {
      info: { title: 'T', version: '1' },
      logger: silent,
    })
    expect(operation(inherited, 'get', '/users/{userId}')['x-deprecated-message']).toBe(
      'Use GET /v2/users/{userId}',
    )
    expect(operation(inherited, 'get', '/users')).not.toHaveProperty('x-deprecated-message')
  })

  describe('parameters', () => {
    it('describes path, query, header and cookie parameters', async () => {
      // The builder has no headers or cookies slot; core reads them from any
      // declaration-shaped object.
      const endpoint = {
        config: {
          method: 'GET' as const,
          url: '/orgs/$orgId/users/$userId' as const,
          urlParamsSchema: z.object({ orgId: z.uuid(), userId: z.coerce.number() }),
          querySchema: z.object({
            page: z.coerce.number().optional().meta({ description: 'Page number' }),
            search: z.string(),
          }),
          headersSchema: z.object({ 'x-tenant': z.string() }),
          cookiesSchema: z.object({ session: z.string().optional() }),
          responseSchema: userSchema,
        },
      }

      @Controller()
      class UsersController {
        getUser = handler(endpoint, () => ({ id: '1', name: 'Ann' }))
      }

      const document = await documentOf([UsersController])
      expect(operation(document, 'get', '/orgs/{orgId}/users/{userId}').parameters).toEqual([
        {
          name: 'orgId',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ format: 'uuid' }),
        },
        { name: 'userId', in: 'path', required: true, schema: { type: 'number' } },
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'number', description: 'Page number' },
          description: 'Page number',
        },
        { name: 'search', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'x-tenant', in: 'header', required: true, schema: { type: 'string' } },
        { name: 'session', in: 'cookie', required: false, schema: { type: 'string' } },
      ])
    })

    it('describes path parameters as strings without a urlParamsSchema', async () => {
      @Controller()
      class UsersController {
        getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))
      }

      const document = await documentOf([UsersController])
      expect(operation(document, 'get', '/users/{userId}').parameters).toEqual([
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ])
    })

    it('omits parameters when there are none', async () => {
      @Controller()
      class UsersController {
        createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
      }

      expect(operation(await documentOf([UsersController]), 'post', '/users')).not.toHaveProperty(
        'parameters',
      )
    })
  })

  describe('JSON endpoints', () => {
    it('describes a 200 response with the response schema, and declared errors', async () => {
      @Controller()
      class UsersController {
        getUser = handler(getUser, () => ({ id: '1', name: 'Ann' }))
      }

      const { responses, requestBody } = operation(
        await documentOf([UsersController]),
        'get',
        '/users/{userId}',
      )
      expect(requestBody).toBeUndefined()
      expect(Object.keys(responses)).toEqual(['200', '404'])
      expect(responses['200']).toMatchObject({
        description: 'Successful response',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      })
      expect(responses['404']).toMatchObject({
        description: 'Error response (404)',
        content: {
          'application/json': { schema: { properties: { message: { type: 'string' } } } },
        },
      })
    })

    it('describes a response without a schema as a bare 200', async () => {
      const ping = { config: { method: 'GET' as const, url: '/ping' as const } }

      @Controller()
      class PingController {
        ping = handler(ping, () => ({ ok: true }))
      }

      expect(operation(await documentOf([PingController]), 'get', '/ping').responses).toEqual({
        200: { description: 'Successful response' },
      })
    })

    it('describes the JSON request body', async () => {
      @Controller()
      class UsersController {
        createUser = handler(createUser, ({ data }) => reply(201, { id: '1', name: data.name }))
      }

      expect(operation(await documentOf([UsersController]), 'post', '/users').requestBody).toEqual({
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
        },
      })
    })
  })

  describe('response: void endpoints', () => {
    it('describes a 204 response without content and keeps the request body', async () => {
      const deleteUser = api.declareEndpoint({
        method: 'DELETE',
        url: '/users/$userId',
        requestSchema: z.object({ reason: z.string() }),
        response: 'void',
        errorSchema: { 404: errorSchema },
      })

      @Controller()
      class UsersController {
        deleteUser = handler(deleteUser, () => {})
      }

      const found = operation(await documentOf([UsersController]), 'delete', '/users/{userId}')
      expect(found.responses['204']).toEqual({ description: 'No content' })
      expect(Object.keys(found.responses)).toEqual(['204', '404'])
      expect(found.requestBody?.content['application/json'].schema).toMatchObject({
        properties: { reason: { type: 'string' } },
      })
    })
  })

  describe('responses endpoints', () => {
    it('describes one response per declared status', async () => {
      const upsert = api.declareEndpoint({
        method: 'PUT',
        url: '/users/$userId',
        requestSchema: z.object({ name: z.string() }),
        responses: { 200: userSchema, 201: z.object({ id: z.string(), created: z.boolean() }) },
        errorSchema: { 409: errorSchema },
      })

      @Controller()
      class UsersController {
        upsert = handler(upsert, () => reply(200, { id: '1', name: 'Ann' }))
      }

      const { responses } = operation(await documentOf([UsersController]), 'put', '/users/{userId}')
      expect(Object.keys(responses)).toEqual(['200', '201', '409'])
      expect(responses['200']).toMatchObject({
        description: 'Successful response',
        content: { 'application/json': { schema: { properties: { name: { type: 'string' } } } } },
      })
      expect(responses['201']).toMatchObject({
        content: {
          'application/json': { schema: { properties: { created: { type: 'boolean' } } } },
        },
      })
      expect(responses['409'].description).toBe('Error response (409)')
    })

    it('describes bodiless statuses without content', async () => {
      const accept = api.declareEndpoint({
        method: 'POST',
        url: '/jobs',
        responses: { 202: null, 204: null },
      })

      @Controller()
      class JobsController {
        accept = handler(accept, () => reply(202, undefined))
      }

      expect(operation(await documentOf([JobsController]), 'post', '/jobs').responses).toEqual({
        202: { description: 'No content' },
        204: { description: 'No content' },
      })
    })
  })

  describe('multipart endpoints', () => {
    const upload = api.declareEndpoint({
      method: 'POST',
      url: '/files',
      body: 'multipart',
      requestSchema: z.object({
        file: z.instanceof(File),
        attachments: z.array(z.instanceof(File)).optional(),
        title: z.string(),
      }),
      responseSchema: z.object({ id: z.string() }),
    })

    it('describes the body as multipart/form-data with binary file fields and a JSON response', async () => {
      @Controller()
      class FilesController {
        upload = handler(upload, () => ({ id: '1' }))
      }

      const found = operation(await documentOf([FilesController]), 'post', '/files')
      expect(found.requestBody).toEqual({
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                attachments: { type: 'array', items: { type: 'string', format: 'binary' } },
                title: { type: 'string' },
              },
              required: ['file', 'title'],
            },
          },
        },
      })
      expect(found.responses['200'].content).toHaveProperty('application/json')
    })

    it('describes a schemaless upload as an object, with a 204 for response: void', async () => {
      const raw = api.declareEndpoint({
        method: 'POST',
        url: '/raw',
        body: 'multipart',
        response: 'void',
      })

      @Controller()
      class FilesController {
        raw = handler(raw, () => {})
      }

      const found = operation(await documentOf([FilesController]), 'post', '/raw')
      expect(found.requestBody).toEqual({
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object' } } },
      })
      expect(found.responses).toEqual({ 204: { description: 'No content' } })
    })

    it('describes one response per status of a responses map', async () => {
      const create = api.declareEndpoint({
        method: 'POST',
        url: '/avatars',
        body: 'multipart',
        requestSchema: z.object({ file: z.instanceof(File) }),
        responses: { 201: z.object({ id: z.string() }), 202: null },
      })

      @Controller()
      class FilesController {
        create = handler(create, () => reply(202, undefined))
      }

      const { responses } = operation(await documentOf([FilesController]), 'post', '/avatars')
      expect(Object.keys(responses)).toEqual(['201', '202'])
      expect(responses['202']).toEqual({ description: 'No content' })
    })
  })

  describe('stream, text and blob endpoints', () => {
    const download = api.declareEndpoint({ method: 'GET', url: '/download', response: 'stream' })
    const events = api.declareEndpoint({ method: 'GET', url: '/events', response: 'stream' })
    const text = api.declareEndpoint({ method: 'GET', url: '/text', response: 'text' })
    const blob = api.declareEndpoint({
      method: 'GET',
      url: '/blob',
      response: 'blob',
      errorSchema: { 404: errorSchema },
    })
    const csv = api.declareEndpoint({ method: 'GET', url: '/csv', response: 'text' })

    it('describes them with their content type, which ApiStream overrides', async () => {
      @Controller()
      class StreamController {
        download = handler(download, async function* () {
          yield 'x'
        })

        @ApiStream({ contentType: 'text/event-stream', description: 'Live events' })
        events = handler(events, async function* () {
          yield 'x'
        })

        text = handler(text, () => 'hello')

        blob = handler(blob, () => new Blob(['x']))

        csv = handler(csv, { attributes: [ApiStream({ contentType: 'text/csv' })] }, () => 'a,b')
      }

      const document = await documentOf([StreamController])
      expect(operation(document, 'get', '/download').responses).toEqual({
        200: {
          description: 'Stream response',
          content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
        },
      })
      expect(operation(document, 'get', '/events').responses).toEqual({
        200: {
          description: 'Live events',
          content: {
            'text/event-stream': {
              schema: { type: 'string', description: 'Server-Sent Events stream' },
            },
          },
        },
      })
      expect(operation(document, 'get', '/text').responses).toEqual({
        200: {
          description: 'Successful response',
          content: { 'text/plain': { schema: { type: 'string' } } },
        },
      })
      const blobResponses = operation(document, 'get', '/blob').responses
      expect(blobResponses['200'].content).toEqual({
        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
      })
      expect(blobResponses['404'].description).toBe('Error response (404)')
      expect(operation(document, 'get', '/csv').responses['200'].content).toEqual({
        'text/csv': { schema: { type: 'string' } },
      })
    })
  })

  describe('schemas', () => {
    it('shares named schemas through components.schemas', async () => {
      const User = z.object({ id: z.string() }).meta({ id: 'User' })
      const one = api.declareEndpoint({ method: 'GET', url: '/one', responseSchema: User })
      const many = api.declareEndpoint({
        method: 'GET',
        url: '/many',
        responseSchema: z.array(User),
      })

      @Controller()
      class UsersController {
        one = handler(one, () => ({ id: '1' }))
        many = handler(many, () => [])
      }

      const document = await documentOf([UsersController])
      expect(Object.keys(document.components?.schemas ?? {})).toEqual(['User'])
      expect(operation(document, 'get', '/many').responses['200'].content).toEqual({
        'application/json': {
          schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
        },
      })
    })

    describe('a schema library without the Standard JSON Schema extension', () => {
      const plain = <T,>(): StandardSchemaV1<T, T> => ({
        '~standard': {
          version: 1,
          vendor: 'hand-written',
          validate: (value) => ({ value: value as T }),
        },
      })
      const bodySchema = plain<{ name: string }>()
      const resultSchema = plain<{ id: string }>()
      const create = api.declareEndpoint({
        method: 'POST',
        url: '/things',
        requestSchema: bodySchema,
        responseSchema: resultSchema,
      })

      it('is documented through the toJsonSchema option', async () => {
        @Controller()
        class ThingsController {
          create = handler(create, () => ({ id: '1' }))
        }

        const logger = { warn: vi.fn(), debug: vi.fn() }
        const toJsonSchema = vi.fn((schema: StandardSchemaV1, io: string) =>
          schema === bodySchema
            ? { type: 'object', properties: { name: { type: 'string' } }, description: io }
            : { type: 'object', properties: { id: { type: 'string' } }, description: io },
        )
        const found = operation(
          await documentOf([ThingsController], { toJsonSchema, logger }),
          'post',
          '/things',
        )

        expect(found.requestBody?.content['application/json'].schema).toEqual({
          type: 'object',
          properties: { name: { type: 'string' } },
          description: 'input',
        })
        expect(found.responses['200'].content?.['application/json'].schema).toEqual({
          type: 'object',
          properties: { id: { type: 'string' } },
          description: 'output',
        })
        expect(logger.warn).not.toHaveBeenCalled()
      })

      it('is documented as unconstrained, with one warning naming the endpoint', async () => {
        @Controller()
        class ThingsController {
          create = handler(create, () => ({ id: '1' }))
        }

        const logger = { warn: vi.fn(), debug: vi.fn() }
        const found = operation(await documentOf([ThingsController], { logger }), 'post', '/things')

        expect(found.requestBody).toEqual({
          required: true,
          content: { 'application/json': { schema: {} } },
        })
        expect(found.responses['200'].content).toEqual({ 'application/json': { schema: {} } })
        // Two schemas of one endpoint: still a single warning.
        expect(logger.warn).toHaveBeenCalledTimes(1)
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('POST /things (ThingsController.create)'),
        )
      })
    })
  })
})
