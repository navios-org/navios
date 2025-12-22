// oxlint-disable no-unused-vars
import { builder } from '@navios/builder'

import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type {
  EndpointParams,
  EndpointResult,
  MultipartParams,
  MultipartResult,
  StreamParams,
} from '../index.mjs'

import {
  Controller,
  Endpoint,
  Header,
  HttpCode,
  Module,
  Multipart,
  Stream,
  UseGuards,
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

const uploadFileEndpoint = api.declareMultipart({
  method: 'POST',
  url: '/upload',
  requestSchema: multipartRequestSchema,
  responseSchema,
})

const downloadFileEndpoint = api.declareStream({
  method: 'GET',
  url: '/files/$fileId',
  querySchema,
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
        async getUser(request: {
          wrong: string
        }): EndpointResult<typeof getUserEndpoint> {
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
        async uploadFile(request: {
          wrong: string
        }): MultipartResult<typeof uploadFileEndpoint> {
          return { id: '1', name: 'test.jpg' }
        }
      }
    })
  })

  describe('Stream decorator', () => {
    test('should enforce correct parameter type', () => {
      @Controller()
      class FileController {
        @Stream(downloadFileEndpoint)
        async downloadFile(
          request: StreamParams<typeof downloadFileEndpoint>,
          reply: any,
        ): Promise<void> {
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

    test('should require reply parameter', () => {
      @Controller()
      class FileController {
        // @ts-expect-error - missing reply parameter
        @Stream(downloadFileEndpoint)
        async downloadFile(
          request: StreamParams<typeof downloadFileEndpoint>,
        ): Promise<void> {
          // Stream methods must have reply parameter
        }
      }
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
