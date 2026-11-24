// oxlint-disable no-unused-vars
import { builder } from '@navios/builder'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { Schema } from '@navios/builder'

import { reply } from '../../utils/index.mjs'
import {
  AttributeFactory,
  Controller,
  Endpoint,
  Header,
  HttpCode,
  Injectable,
  Module,
  Multipart,
  Stream,
  UseGuards,
} from '../index.mjs'

import type { EndpointReply } from '../../utils/index.mjs'
import type {
  EndpointParams,
  EndpointResult,
  MultipartParams,
  MultipartResult,
  StreamParams,
} from '../index.mjs'

// Create a test API builder
const api = builder()

// Test schemas
const responseSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const querySchema = z.object({
  page: z.number(),
  limit: z.number(),
})

const requestSchema = z.object({
  name: z.string(),
  email: z.string(),
})

const multipartRequestSchema = z.object({
  file: z.instanceof(File),
  description: z.string(),
})

// Test endpoint declarations
const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema,
  responseSchema,
})

const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema,
  responseSchema,
})

const uploadFileEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/upload',
  body: 'multipart',
  requestSchema: multipartRequestSchema,
  responseSchema,
})

const downloadFileEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId',
  response: 'blob',
  querySchema,
})

const deleteUserEndpoint = api.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})

const putUserEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema,
  responses: { 200: responseSchema, 201: z.object({ id: z.string() }), 204: null },
})

const uploadAvatarEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId/avatar',
  body: 'multipart',
  response: 'void',
  requestSchema: multipartRequestSchema,
})

const importUsersEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users/import',
  body: 'multipart',
  requestSchema: multipartRequestSchema,
  responses: { 200: responseSchema, 201: z.object({ id: z.string() }), 204: null },
})

const convertFileEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/files/convert',
  body: 'multipart',
  response: 'blob',
  requestSchema: multipartRequestSchema,
})

const uploadAsJsonEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/upload-json',
  requestSchema: multipartRequestSchema,
  responseSchema,
})

const downloadTextEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/text',
  response: 'text',
})

/** A Standard Schema that is not a Zod schema. */
const foreignSchema: Schema<{ id: string }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as { id: string } }),
  },
}

const foreignEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/foreign',
  responseSchema: foreignSchema,
})

// Mock guard for testing
class AuthGuard {
  canActivate() {
    return true
  }
}

describe('Legacy Decorators Type Safety', () => {
  describe('Module decorator', () => {
    test('should accept valid module options', () => {
      @Module({
        controllers: [],
        imports: [],
        guards: [],
      })
      class TestModule {}

      expectTypeOf(TestModule).toBeConstructibleWith()
    })

    test('should accept controllers in module', () => {
      @Controller()
      class TestController {}

      @Module({
        controllers: [TestController],
      })
      class TestModule {}

      expectTypeOf(TestModule).toBeConstructibleWith()
    })
  })

  describe('Controller decorator', () => {
    test('should accept valid controller options', () => {
      @Controller()
      class TestController {}

      expectTypeOf(TestController).toBeConstructibleWith()
    })

    test('should accept guards in controller', () => {
      @Controller({
        guards: [AuthGuard],
      })
      class TestController {}

      expectTypeOf(TestController).toBeConstructibleWith()
    })
  })

  describe('Endpoint decorator', () => {
    test('should enforce correct parameter type', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          // TypeScript should infer:
          // - request.urlParams.userId: string | number
          // - request.params.page: number
          // - request.params.limit: number
          expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
          expectTypeOf(request.params.page).toEqualTypeOf<number>()
          expectTypeOf(request.params.limit).toEqualTypeOf<number>()
          return {
            id: request.urlParams.userId.toString(),
            name: 'Test',
          }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should enforce correct return type', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          // Return type should match responseSchema
          return {
            id: '1',
            name: 'John',
          }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should reject incorrect parameter type', () => {
      @Controller()
      class UserController {
        // @ts-expect-error - wrong parameter type
        @Endpoint(getUserEndpoint)
        async getUser(request: { wrong: string }): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }
    })

    test('should reject incorrect return type', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          // @ts-expect-error - wrong return type
          return { wrong: 'value' }
        }
      }
    })

    test('should work with POST endpoint with request body', () => {
      @Controller()
      class UserController {
        @Endpoint(createUserEndpoint)
        async createUser(
          request: EndpointParams<typeof createUserEndpoint>,
        ): EndpointResult<typeof createUserEndpoint> {
          // TypeScript should infer:
          // - request.data.name: string
          // - request.data.email: string
          expectTypeOf(request.data.name).toEqualTypeOf<string>()
          expectTypeOf(request.data.email).toEqualTypeOf<string>()
          return {
            id: '1',
            name: request.data.name,
          }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('Multipart decorator', () => {
    test('should enforce correct parameter type', () => {
      @Controller()
      class FileController {
        @Multipart(uploadFileEndpoint)
        async uploadFile(
          request: MultipartParams<typeof uploadFileEndpoint>,
        ): MultipartResult<typeof uploadFileEndpoint> {
          // TypeScript should infer:
          // - request.data.file: File
          // - request.data.description: string
          expectTypeOf(request.data.file).toEqualTypeOf<File>()
          expectTypeOf(request.data.description).toEqualTypeOf<string>()
          return {
            id: '1',
            name: 'uploaded.jpg',
          }
        }
      }

      expectTypeOf(FileController).toBeConstructibleWith()
    })

    test('should reject incorrect parameter type', () => {
      @Controller()
      class FileController {
        // @ts-expect-error - wrong parameter type
        @Multipart(uploadFileEndpoint)
        async uploadFile(request: { wrong: string }): MultipartResult<typeof uploadFileEndpoint> {
          return { id: '1', name: 'test.jpg' }
        }
      }
    })

    test('should accept a response: void declaration', () => {
      @Controller()
      class FileController {
        @Multipart(uploadAvatarEndpoint)
        async upload(
          request: MultipartParams<typeof uploadAvatarEndpoint>,
        ): MultipartResult<typeof uploadAvatarEndpoint> {
          expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
          expectTypeOf(request.data.file).toEqualTypeOf<File>()
        }

        // Without an annotation
        @Multipart(uploadAvatarEndpoint)
        async inferred(_request: MultipartParams<typeof uploadAvatarEndpoint>) {}

        // @HttpCode is still allowed on a void endpoint
        @Multipart(uploadAvatarEndpoint)
        @HttpCode(202)
        async accepted(_request: MultipartParams<typeof uploadAvatarEndpoint>) {}
      }

      expectTypeOf<MultipartResult<typeof uploadAvatarEndpoint>>().toEqualTypeOf<Promise<void>>()
      expectTypeOf(FileController).toBeConstructibleWith()
    })

    test('should reject a returned value from a void endpoint', () => {
      const define = () => {
        @Controller()
        class FileController {
          // @ts-expect-error - a void endpoint returns nothing
          @Multipart(uploadAvatarEndpoint)
          async upload() {
            return { id: '1', name: 'a' }
          }
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('should accept a declaration with a responses map', () => {
      @Controller()
      class UserController {
        @Multipart(importUsersEndpoint)
        async importUsers(
          request: MultipartParams<typeof importUsersEndpoint>,
        ): MultipartResult<typeof importUsersEndpoint> {
          expectTypeOf(request.data.file).toEqualTypeOf<File>()
          if (request.data.file.size === 0) return reply(204)
          if (request.data.description === 'new') return reply(201, { id: '1' })
          return reply(200, { id: '1', name: request.data.file.name })
        }
      }

      expectTypeOf<MultipartResult<typeof importUsersEndpoint>>().toEqualTypeOf<
        Promise<
          | EndpointReply<200, { id: string; name: string }>
          | EndpointReply<201, { id: string }>
          | EndpointReply<204, undefined>
        >
      >()
      expectTypeOf<MultipartResult<typeof importUsersEndpoint>>().toEqualTypeOf<
        EndpointResult<typeof importUsersEndpoint>
      >()
      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should accept a narrower return type without an annotation', () => {
      @Controller()
      class UserController {
        // Only some of the declared statuses
        @Multipart(importUsersEndpoint)
        async subset(request: MultipartParams<typeof importUsersEndpoint>) {
          return request.data.file.size === 0 ? reply(204) : reply(201, { id: '1' })
        }

        // Never returns at all
        @Multipart(importUsersEndpoint)
        async alwaysThrows(_request: MultipartParams<typeof importUsersEndpoint>): Promise<never> {
          throw new Error('not implemented')
        }

        // Synchronous
        @Multipart(importUsersEndpoint)
        sync() {
          return reply(204)
        }

        // A JSON multipart endpoint, without an annotation
        @Multipart(uploadFileEndpoint)
        async json(request: MultipartParams<typeof uploadFileEndpoint>) {
          return { id: '1', name: request.data.file.name }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should reject wrong replies', () => {
      const define = () => {
        @Controller()
        class UserController {
          // @ts-expect-error - 404 is not a declared status
          @Multipart(importUsersEndpoint)
          async undeclaredStatus() {
            return reply(404, { message: 'not found' })
          }

          // @ts-expect-error - the body does not match the schema of status 200
          @Multipart(importUsersEndpoint)
          async wrongBody() {
            return reply(200, { wrong: true })
          }

          // @ts-expect-error - status 200 needs a body
          @Multipart(importUsersEndpoint)
          async missingBody() {
            return reply(200)
          }

          // @ts-expect-error - a bare object is not a reply
          @Multipart(importUsersEndpoint)
          async bareObject() {
            return { id: '1', name: 'a' }
          }

          // @ts-expect-error - the method must return a reply
          @Multipart(importUsersEndpoint)
          async nothing() {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('should reject response: blob', () => {
      const define = () => {
        @Controller()
        class FileController {
          // @ts-expect-error - response: 'blob' is not served by @Multipart
          @Multipart(convertFileEndpoint)
          async convert(): Promise<void> {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })
  })

  describe('Stream decorator', () => {
    test('should enforce correct parameter type', () => {
      @Controller()
      class FileController {
        @Stream(downloadFileEndpoint)
        async downloadFile(request: StreamParams<typeof downloadFileEndpoint>): Promise<void> {
          // TypeScript should infer:
          // - request.urlParams.fileId: string | number
          // - request.params.page: number
          // - request.params.limit: number
          expectTypeOf(request.urlParams.fileId).toEqualTypeOf<string>()
          expectTypeOf(request.params.page).toEqualTypeOf<number>()
          expectTypeOf(request.params.limit).toEqualTypeOf<number>()
        }
      }

      expectTypeOf(FileController).toBeConstructibleWith()
    })

    test('should work without reply parameter (Bun compatibility)', () => {
      @Controller()
      class FileController {
        @Stream(downloadFileEndpoint)
        async downloadFile(request: StreamParams<typeof downloadFileEndpoint>): Promise<void> {
          // Stream methods can work without reply parameter (for Bun)
          expectTypeOf(request.urlParams.fileId).toEqualTypeOf<string>()
        }
      }

      expectTypeOf(FileController).toBeConstructibleWith()
    })
  })

  // Applying a decorator to a declaration it cannot serve throws at runtime,
  // and this file is also loaded by the test runner. The rejected classes
  // therefore live in functions that are type-checked but never called.
  describe('response: void endpoints', () => {
    test('should accept a method that returns nothing', () => {
      @Controller()
      class UserController {
        @Endpoint(deleteUserEndpoint)
        async deleteUser(
          request: EndpointParams<typeof deleteUserEndpoint>,
        ): EndpointResult<typeof deleteUserEndpoint> {
          expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
        }
      }

      expectTypeOf<EndpointResult<typeof deleteUserEndpoint>>().toEqualTypeOf<Promise<void>>()
      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should reject a returned value', () => {
      const define = () => {
        @Controller()
        class UserController {
          // @ts-expect-error - a void endpoint has no body to return
          @Endpoint(deleteUserEndpoint)
          async deleteUser(request: EndpointParams<typeof deleteUserEndpoint>) {
            return { deleted: request.urlParams.userId }
          }
        }
      }
      expectTypeOf(define).toBeFunction()
    })
  })

  describe('responses endpoints', () => {
    test('should accept a reply for each declared status', () => {
      @Controller()
      class UserController {
        @Endpoint(putUserEndpoint)
        async putUser(
          request: EndpointParams<typeof putUserEndpoint>,
        ): EndpointResult<typeof putUserEndpoint> {
          expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
          expectTypeOf(request.data).toEqualTypeOf<{ name: string; email: string }>()
          if (request.data.name === '') return reply(204)
          if (request.data.name === 'new') return reply(201, { id: '1' })
          return reply(200, { id: request.urlParams.userId, name: request.data.name })
        }
      }

      expectTypeOf<EndpointResult<typeof putUserEndpoint>>().toEqualTypeOf<
        Promise<
          | EndpointReply<200, { id: string; name: string }>
          | EndpointReply<201, { id: string }>
          | EndpointReply<204, undefined>
        >
      >()
      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should accept a narrower return type without an annotation', () => {
      @Controller()
      class UserController {
        // Only some of the declared statuses
        @Endpoint(putUserEndpoint)
        async subset(request: EndpointParams<typeof putUserEndpoint>) {
          return request.data.name === '' ? reply(204) : reply(201, { id: '1' })
        }

        // Never returns at all. (Without the annotation TypeScript infers
        // Promise<void> for an async function that only throws.)
        @Endpoint(putUserEndpoint)
        async alwaysThrows(_request: EndpointParams<typeof putUserEndpoint>): Promise<never> {
          throw new Error('not implemented')
        }

        // Synchronous
        @Endpoint(putUserEndpoint)
        sync() {
          return reply(204)
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should reject wrong replies', () => {
      const define = () => {
        @Controller()
        class UserController {
          // @ts-expect-error - 404 is not a declared status
          @Endpoint(putUserEndpoint)
          async undeclaredStatus() {
            return reply(404, { message: 'not found' })
          }

          // @ts-expect-error - the body does not match the schema of status 200
          @Endpoint(putUserEndpoint)
          async wrongBody() {
            return reply(200, { wrong: true })
          }

          // @ts-expect-error - status 200 needs a body
          @Endpoint(putUserEndpoint)
          async missingBody() {
            return reply(200)
          }

          // @ts-expect-error - status 204 is declared without a body
          @Endpoint(putUserEndpoint)
          async bodyForNullEntry() {
            return reply(204, { id: '1' })
          }

          // @ts-expect-error - a bare object is not a reply
          @Endpoint(putUserEndpoint)
          async bareObject() {
            return { id: '1', name: 'a' }
          }

          // @ts-expect-error - the method must return a reply
          @Endpoint(putUserEndpoint)
          async nothing() {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('Multipart without body: multipart and Stream should reject a responses declaration', () => {
      const define = () => {
        @Controller()
        class UserController {
          // @ts-expect-error - declared without body: 'multipart'
          @Multipart(putUserEndpoint)
          async multipart() {
            return reply(204)
          }

          // @ts-expect-error - a responses map belongs to @Endpoint or @Multipart
          @Stream(putUserEndpoint)
          async stream(): Promise<void> {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })
  })

  describe('decorator / declaration agreement', () => {
    test('Endpoint should reject multipart and stream declarations', () => {
      const define = () => {
        @Controller()
        class FileController {
          // @ts-expect-error - body: 'multipart' belongs to @Multipart
          @Endpoint(uploadFileEndpoint)
          async upload(): Promise<{ id: string; name: string }> {
            return { id: '1', name: 'a' }
          }

          // @ts-expect-error - response: 'blob' belongs to @Stream
          @Endpoint(downloadFileEndpoint)
          async download(): Promise<void> {}

          // @ts-expect-error - response: 'text' belongs to @Stream
          @Endpoint(downloadTextEndpoint)
          async text(): Promise<void> {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('Multipart should reject a declaration without body: multipart', () => {
      const define = () => {
        @Controller()
        class FileController {
          // @ts-expect-error - declared without body: 'multipart'
          @Multipart(uploadAsJsonEndpoint)
          async upload(
            request: EndpointParams<typeof uploadAsJsonEndpoint>,
          ): EndpointResult<typeof uploadAsJsonEndpoint> {
            return { id: '1', name: request.data.description }
          }
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('Stream should reject JSON and void declarations', () => {
      const define = () => {
        @Controller()
        class UserController {
          // @ts-expect-error - a JSON endpoint belongs to @Endpoint
          @Stream(getUserEndpoint)
          async getUser(request: EndpointParams<typeof getUserEndpoint>): Promise<void> {}

          // @ts-expect-error - response: 'void' belongs to @Endpoint
          @Stream(deleteUserEndpoint)
          async deleteUser(request: EndpointParams<typeof deleteUserEndpoint>): Promise<void> {}
        }
      }
      expectTypeOf(define).toBeFunction()
    })

    test('Stream should accept a response: text declaration', () => {
      @Controller()
      class FileController {
        @Stream(downloadTextEndpoint)
        async text(request: StreamParams<typeof downloadTextEndpoint>): Promise<void> {
          expectTypeOf(request.urlParams.fileId).toEqualTypeOf<string>()
        }
      }

      expectTypeOf(FileController).toBeConstructibleWith()
    })

    test('Endpoint should reject non-Zod schemas', () => {
      const define = () => {
        @Controller()
        class ForeignController {
          // @ts-expect-error - responseSchema is not a Zod schema
          @Endpoint(foreignEndpoint)
          async get(): Promise<{ id: string }> {
            return { id: '1' }
          }
        }
      }
      expectTypeOf(define).toBeFunction()
    })
  })

  describe('UseGuards decorator', () => {
    test('should work on class level', () => {
      @Controller()
      @UseGuards(AuthGuard)
      class ProtectedController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(ProtectedController).toBeConstructibleWith()
    })

    test('should work on method level', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        @UseGuards(AuthGuard)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('Header decorator', () => {
    test('should work with string value', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        @Header('Cache-Control', 'max-age=3600')
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })

    test('should work with number value', () => {
      @Controller()
      class UserController {
        @Endpoint(getUserEndpoint)
        @Header('Content-Length', 100)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('HttpCode decorator', () => {
    test('should accept valid status codes', () => {
      @Controller()
      class UserController {
        @Endpoint(createUserEndpoint)
        @HttpCode(201)
        async createUser(
          request: EndpointParams<typeof createUserEndpoint>,
        ): EndpointResult<typeof createUserEndpoint> {
          return { id: '1', name: request.data.name }
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith()
    })
  })

  describe('Injectable decorator', () => {
    test('should work with services', () => {
      @Injectable()
      class UserService {
        getUser(id: string) {
          return { id, name: 'John' }
        }
      }

      expectTypeOf(UserService).toBeConstructibleWith()
    })

    test('should work with controller dependencies', () => {
      @Injectable()
      class UserService {
        getUser(id: string) {
          return { id, name: 'John' }
        }
      }

      @Controller()
      class UserController {
        constructor(private readonly userService: UserService) {}

        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return this.userService.getUser(request.urlParams.userId.toString())
        }
      }

      expectTypeOf(UserController).toBeConstructibleWith({} as InstanceType<typeof UserService>)
    })
  })

  describe('AttributeFactory', () => {
    test('should create simple attribute for controllers', () => {
      const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

      // Note: In legacy decorators, decorators are applied bottom-to-top
      // So @Controller() must be at the bottom to run first
      @Public()
      @Controller()
      class PublicController {
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(PublicController).toBeConstructibleWith()
      expectTypeOf(Public.token).toEqualTypeOf<symbol>()
    })

    test('should create attribute with schema for endpoints', () => {
      const RateLimit = AttributeFactory.createAttribute(
        Symbol.for('RateLimit'),
        z.object({ requests: z.number(), window: z.number() }),
      )

      @Controller()
      class RateLimitedController {
        // Note: For method decorators, @Endpoint must be at the bottom
        @RateLimit({ requests: 100, window: 60000 })
        @Endpoint(getUserEndpoint)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return { id: '1', name: 'John' }
        }
      }

      expectTypeOf(RateLimitedController).toBeConstructibleWith()
      expectTypeOf(RateLimit.token).toEqualTypeOf<symbol>()
      expectTypeOf(RateLimit.schema).toBeObject()
    })

    test('should create attribute for modules', () => {
      const ApiVersion = AttributeFactory.createAttribute(Symbol.for('ApiVersion'), z.string())

      @Controller()
      class VersionedController {}

      // Note: In legacy decorators, @Module must be at the bottom
      @ApiVersion('v2')
      @Module({
        controllers: [VersionedController],
      })
      class VersionedModule {}

      expectTypeOf(VersionedModule).toBeConstructibleWith()
    })
  })

  describe('Integration test - full controller', () => {
    test('should work with all decorators together', () => {
      @Controller({
        guards: [AuthGuard],
      })
      @UseGuards(AuthGuard)
      class UserController {
        @Endpoint(getUserEndpoint)
        @UseGuards(AuthGuard)
        @Header('Cache-Control', 'max-age=3600')
        @HttpCode(200)
        async getUser(
          request: EndpointParams<typeof getUserEndpoint>,
        ): EndpointResult<typeof getUserEndpoint> {
          return {
            id: request.urlParams.userId.toString(),
            name: 'John',
          }
        }

        @Endpoint(createUserEndpoint)
        @HttpCode(201)
        async createUser(
          request: EndpointParams<typeof createUserEndpoint>,
        ): EndpointResult<typeof createUserEndpoint> {
          return {
            id: '1',
            name: request.data.name,
          }
        }
      }

      @Module({
        controllers: [UserController],
      })
      class AppModule {}

      expectTypeOf(UserController).toBeConstructibleWith()
      expectTypeOf(AppModule).toBeConstructibleWith()
    })
  })
})
