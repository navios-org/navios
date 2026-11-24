// oxlint-disable no-unused-vars
import { builder } from '@navios/builder'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { Schema } from '@navios/builder'

import { Controller, Endpoint, HttpCode, Multipart, Stream } from '../decorators/index.mjs'
import { reply } from '../utils/index.mjs'

import type {
  EndpointDecoratorConfig,
  EndpointParams,
  EndpointResult,
  MultipartDecoratorConfig,
  MultipartParams,
  MultipartResult,
  StreamParams,
} from '../decorators/index.mjs'
import type { EndpointReply } from '../utils/index.mjs'

const api = builder()

const responseSchema = z.object({ id: z.string(), name: z.string() })

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema: z.object({ page: z.coerce.number() }),
  responseSchema,
})

const createUser = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  body: 'json',
  response: 'json',
  requestSchema: z.object({ name: z.string() }),
  responseSchema,
})

const deleteUser = api.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})

const resetCounters = api.declareEndpoint({
  method: 'POST',
  url: '/counters/reset',
  response: 'void',
})

const createdSchema = z.object({ id: z.string(), createdAt: z.coerce.date() })

const putUser = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responses: { 200: responseSchema, 201: createdSchema, 204: null },
})

const touchUser = api.declareEndpoint({
  method: 'POST',
  url: '/users/touch',
  responses: { 200: z.object({ role: z.enum(['admin', 'user']) }), 204: null },
})

const uploadFile = api.declareEndpoint({
  method: 'POST',
  url: '/files',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema,
})

const fileSchema = z.object({ file: z.instanceof(File) })

const uploadAvatar = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId/avatar',
  body: 'multipart',
  response: 'void',
  requestSchema: fileSchema,
})

const importUsers = api.declareEndpoint({
  method: 'POST',
  url: '/users/import',
  body: 'multipart',
  requestSchema: fileSchema,
  responses: { 200: responseSchema, 201: createdSchema, 204: null },
})

const convertFile = api.declareEndpoint({
  method: 'POST',
  url: '/files/convert',
  body: 'multipart',
  response: 'blob',
  requestSchema: fileSchema,
})

const uploadAsJson = api.declareEndpoint({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema,
})

const downloadBlob = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId',
  response: 'blob',
})

const downloadText = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/text',
  response: 'text',
})

const downloadStream = api.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/stream',
  response: 'stream',
})

/** A Standard Schema that is not a Zod schema. */
const foreignSchema: Schema<{ id: string }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as { id: string } }),
  },
}

// Applying a decorator to a declaration it cannot serve throws at runtime
// (see __tests__/endpoint-declaration.spec.mts), and this file is also loaded
// by the test runner. The rejected classes therefore live in functions that
// are type-checked but never called.

const foreignResponse = api.declareEndpoint({
  method: 'GET',
  url: '/foreign',
  responseSchema: foreignSchema,
})

const foreignRequest = api.declareEndpoint({
  method: 'POST',
  url: '/foreign',
  requestSchema: foreignSchema,
  responseSchema,
})

describe('@Endpoint', () => {
  test('types a JSON endpoint from its Zod schemas', () => {
    @Controller()
    class UserController {
      @Endpoint(getUser)
      async getUser(request: EndpointParams<typeof getUser>): EndpointResult<typeof getUser> {
        expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
        expectTypeOf(request.params.page).toEqualTypeOf<number>()
        return { id: request.urlParams.userId, name: 'John' }
      }

      @Endpoint(createUser)
      async createUser(request: EndpointParams<typeof createUser>) {
        expectTypeOf(request.data).toEqualTypeOf<{ name: string }>()
        return { id: '1', name: request.data.name }
      }
    }

    expectTypeOf<EndpointResult<typeof getUser>>().toEqualTypeOf<
      Promise<{ id: string; name: string }>
    >()
  })

  test('rejects a wrong return value', () => {
    const define = () => {
      @Controller()
      class UserController {
        // @ts-expect-error - the method must return the responseSchema input
        @Endpoint(getUser)
        async getUser() {
          return { wrong: true }
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('accepts a response: void endpoint whose method returns nothing', () => {
    @Controller()
    class UserController {
      @Endpoint(deleteUser)
      async deleteUser(
        request: EndpointParams<typeof deleteUser>,
      ): EndpointResult<typeof deleteUser> {
        expectTypeOf(request).toEqualTypeOf<{ urlParams: { userId: string } }>()
      }

      // Synchronous, no arguments, custom status
      @Endpoint(resetCounters)
      @HttpCode(202)
      resetCounters(): void {}
    }

    expectTypeOf<EndpointResult<typeof deleteUser>>().toEqualTypeOf<Promise<void>>()
  })

  test('rejects a value returned from a response: void endpoint', () => {
    const define = () => {
      @Controller()
      class UserController {
        // @ts-expect-error - a void endpoint has no body to return
        @Endpoint(deleteUser)
        async deleteUser(request: EndpointParams<typeof deleteUser>) {
          return { deleted: request.urlParams.userId }
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('types a responses endpoint as one reply per declared status', () => {
    @Controller()
    class UserController {
      @Endpoint(putUser)
      async putUser(request: EndpointParams<typeof putUser>): EndpointResult<typeof putUser> {
        expectTypeOf(request).toEqualTypeOf<{
          urlParams: { userId: string }
          data: { name: string }
        }>()
        if (request.data.name === '') return reply(204)
        if (request.data.name === 'new') return reply(201, { id: '1', createdAt: '2026-01-01' })
        return reply(200, { id: request.urlParams.userId, name: request.data.name })
      }

      // Without a return annotation, synchronous, and no arguments
      @Endpoint(touchUser)
      touchUser() {
        return reply(204)
      }
    }

    @Controller()
    class AnnotatedController {
      // The annotation gives the body its contextual type (literal unions)
      @Endpoint(touchUser)
      async touchUser(): EndpointResult<typeof touchUser> {
        return reply(200, { role: 'admin' })
      }
    }

    expectTypeOf<EndpointResult<typeof putUser>>().toEqualTypeOf<
      Promise<
        | EndpointReply<200, { id: string; name: string }>
        // z.input: what the schema accepts, before coercion
        | EndpointReply<201, { id: string; createdAt: unknown }>
        | EndpointReply<204, undefined>
      >
    >()
    expectTypeOf(putUser.config).toExtend<EndpointDecoratorConfig>()
    expectTypeOf(reply(204)).toEqualTypeOf<EndpointReply<204, undefined>>()
    expectTypeOf(reply(200, { id: '1' })).toEqualTypeOf<EndpointReply<200, { id: string }>>()
  })

  test('rejects wrong replies from a responses endpoint', () => {
    const define = () => {
      @Controller()
      class UserController {
        // @ts-expect-error - 404 is not a declared status
        @Endpoint(putUser)
        async undeclaredStatus() {
          return reply(404, { message: 'not found' })
        }

        // @ts-expect-error - the body does not match the schema of status 200
        @Endpoint(putUser)
        async wrongBody() {
          return reply(200, { wrong: true })
        }

        // @ts-expect-error - the body of status 201 passed with status 200
        @Endpoint(putUser)
        async bodyOfAnotherStatus() {
          return reply(200, { id: '1', createdAt: '2026-01-01' })
        }

        // @ts-expect-error - status 200 needs a body
        @Endpoint(putUser)
        async missingBody() {
          return reply(200)
        }

        // @ts-expect-error - status 204 is declared without a body
        @Endpoint(putUser)
        async bodyForNullEntry() {
          return reply(204, { id: '1', name: 'a' })
        }

        // @ts-expect-error - a bare object is not a reply
        @Endpoint(putUser)
        async bareObject() {
          return { id: '1', name: 'a' }
        }

        // @ts-expect-error - a look-alike object without the brand is not a reply
        @Endpoint(putUser)
        async lookAlike() {
          return { status: 200 as const, body: { id: '1', name: 'a' } }
        }

        // @ts-expect-error - the method must return a reply
        @Endpoint(putUser)
        async nothing() {}
      }

      class AnnotatedController {
        async undeclaredStatus(): EndpointResult<typeof putUser> {
          // @ts-expect-error - 404 is not a declared status
          return reply(404, { message: 'not found' })
        }

        async wrongBody(): EndpointResult<typeof putUser> {
          // @ts-expect-error - the body does not match the schema of status 200
          return reply(200, { wrong: true })
        }

        async bareObject(): EndpointResult<typeof putUser> {
          // @ts-expect-error - a bare object is not a reply
          return { id: '1', name: 'a' }
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects a responses map with non-Zod schemas', () => {
    const define = () => {
      const foreignResponses = api.declareEndpoint({
        method: 'GET',
        url: '/foreign/responses',
        responses: { 200: foreignSchema, 204: null },
      })

      @Controller()
      class ForeignController {
        // @ts-expect-error - responses[200] is not a Zod schema
        @Endpoint(foreignResponses)
        async get() {
          return reply(204)
        }
      }

      // @ts-expect-error - EndpointResult needs Zod schemas
      type Result = EndpointResult<typeof foreignResponses>
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects a body: multipart declaration', () => {
    const define = () => {
      @Controller()
      class FileController {
        // @ts-expect-error - body: 'multipart' belongs to @Multipart
        @Endpoint(uploadFile)
        async upload() {
          return { id: '1', name: 'a' }
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects response: blob | text | stream declarations', () => {
    const define = () => {
      @Controller()
      class FileController {
        // @ts-expect-error - response: 'blob' belongs to @Stream
        @Endpoint(downloadBlob)
        async blob() {}

        // @ts-expect-error - response: 'text' belongs to @Stream
        @Endpoint(downloadText)
        async text() {}

        // @ts-expect-error - response: 'stream' belongs to @Stream
        @Endpoint(downloadStream)
        async stream() {}
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects non-Zod schemas', () => {
    const define = () => {
      @Controller()
      class ForeignController {
        // @ts-expect-error - responseSchema is not a Zod schema
        @Endpoint(foreignResponse)
        async response() {
          return { id: '1' }
        }

        // @ts-expect-error - requestSchema is not a Zod schema
        @Endpoint(foreignRequest)
        async request() {
          return { id: '1', name: 'a' }
        }
      }

      // @ts-expect-error - EndpointParams needs Zod schemas
      type Params = EndpointParams<typeof foreignRequest>
      // @ts-expect-error - EndpointResult needs Zod schemas
      type Result = EndpointResult<typeof foreignResponse>
    }
    expectTypeOf(define).toBeFunction()
  })
})

describe('@Multipart', () => {
  test('accepts a body: multipart declaration', () => {
    @Controller()
    class FileController {
      @Multipart(uploadFile)
      async upload(
        request: MultipartParams<typeof uploadFile>,
      ): MultipartResult<typeof uploadFile> {
        expectTypeOf(request.data.file).toEqualTypeOf<File>()
        return { id: '1', name: request.data.file.name }
      }
    }
  })

  test('accepts a response: void declaration', () => {
    @Controller()
    class FileController {
      @Multipart(uploadAvatar)
      async upload(request: MultipartParams<typeof uploadAvatar>) {
        expectTypeOf(request.urlParams.userId).toEqualTypeOf<string>()
        expectTypeOf(request.data.file).toEqualTypeOf<File>()
      }

      // An explicit result type works too
      @Multipart(uploadAvatar)
      async annotated(
        request: MultipartParams<typeof uploadAvatar>,
      ): MultipartResult<typeof uploadAvatar> {}

      // @HttpCode is still allowed on a void endpoint
      @Multipart(uploadAvatar)
      @HttpCode(202)
      async accepted() {}
    }

    expectTypeOf<MultipartResult<typeof uploadAvatar>>().toEqualTypeOf<Promise<void>>()
    expectTypeOf<MultipartResult<typeof uploadAvatar>>().toEqualTypeOf<
      EndpointResult<typeof uploadAvatar>
    >()
    expectTypeOf(uploadAvatar.config).toExtend<MultipartDecoratorConfig>()
  })

  test('rejects a returned value from a void endpoint', () => {
    const define = () => {
      @Controller()
      class FileController {
        // @ts-expect-error - a void endpoint returns nothing
        @Multipart(uploadAvatar)
        async upload() {
          return { id: '1', name: 'a' }
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('accepts a declaration with a responses map', () => {
    @Controller()
    class UserController {
      @Multipart(importUsers)
      async importUsers(request: MultipartParams<typeof importUsers>) {
        expectTypeOf(request.data.file).toEqualTypeOf<File>()
        if (request.data.file.size === 0) {
          return reply(204)
        }
        if (request.data.file.name === 'new') {
          return reply(201, { id: '1', createdAt: '2026-01-01' })
        }
        return reply(200, { id: '1', name: request.data.file.name })
      }

      // An explicit result type works too
      @Multipart(importUsers)
      async annotated(
        request: MultipartParams<typeof importUsers>,
      ): MultipartResult<typeof importUsers> {
        return reply(200, { id: '1', name: request.data.file.name })
      }

      // A handler may use only some of the declared statuses
      @Multipart(importUsers)
      async onlyNoContent() {
        return reply(204)
      }
    }

    expectTypeOf<MultipartResult<typeof importUsers>>().toEqualTypeOf<
      Promise<
        | EndpointReply<200, { id: string; name: string }>
        | EndpointReply<201, { id: string; createdAt: unknown }>
        | EndpointReply<204, undefined>
      >
    >()
    expectTypeOf<MultipartResult<typeof importUsers>>().toEqualTypeOf<
      EndpointResult<typeof importUsers>
    >()
    expectTypeOf(importUsers.config).toExtend<MultipartDecoratorConfig>()
  })

  test('rejects wrong replies from a responses endpoint', () => {
    const define = () => {
      @Controller()
      class UserController {
        // @ts-expect-error - 404 is not a declared status
        @Multipart(importUsers)
        async undeclaredStatus() {
          return reply(404, { message: 'not found' })
        }

        // @ts-expect-error - the body does not match the schema of status 200
        @Multipart(importUsers)
        async wrongBody() {
          return reply(200, { wrong: true })
        }

        // @ts-expect-error - status 200 needs a body
        @Multipart(importUsers)
        async missingBody() {
          return reply(200)
        }

        // @ts-expect-error - status 204 is declared without a body
        @Multipart(importUsers)
        async bodyForNullEntry() {
          return reply(204, { id: '1', name: 'a' })
        }

        // @ts-expect-error - a bare object is not a reply
        @Multipart(importUsers)
        async bareObject() {
          return { id: '1', name: 'a' }
        }

        // @ts-expect-error - the method must return a reply
        @Multipart(importUsers)
        async nothing() {}
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects response: blob | text | stream', () => {
    const define = () => {
      const convertToText = api.declareEndpoint({
        method: 'POST',
        url: '/files/text',
        body: 'multipart',
        response: 'text',
        requestSchema: fileSchema,
      })
      const convertToStream = api.declareEndpoint({
        method: 'POST',
        url: '/files/stream',
        body: 'multipart',
        response: 'stream',
        requestSchema: fileSchema,
      })

      @Controller()
      class FileController {
        // @ts-expect-error - response: 'blob' is not served by @Multipart
        @Multipart(convertFile)
        async blob() {}

        // @ts-expect-error - response: 'text' is not served by @Multipart
        @Multipart(convertToText)
        async text() {}

        // @ts-expect-error - response: 'stream' is not served by @Multipart
        @Multipart(convertToStream)
        async stream() {}
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects a declaration without body: multipart', () => {
    const define = () => {
      @Controller()
      class FileController {
        // @ts-expect-error - declared without body: 'multipart'
        @Multipart(uploadAsJson)
        async upload() {
          return { id: '1', name: 'a' }
        }

        // @ts-expect-error - body: 'json'
        @Multipart(createUser)
        async create() {
          return { id: '1', name: 'a' }
        }

        // @ts-expect-error - a void declaration without body: 'multipart'
        @Multipart(deleteUser)
        async remove() {}

        // @ts-expect-error - a responses declaration without body: 'multipart'
        @Multipart(putUser)
        async put() {
          return reply(204)
        }
      }
    }
    expectTypeOf(define).toBeFunction()
  })
})

describe('@Stream', () => {
  test('accepts response: blob | text | stream declarations', () => {
    @Controller()
    class FileController {
      @Stream(downloadBlob)
      async blob(request: StreamParams<typeof downloadBlob>) {
        expectTypeOf(request.urlParams.fileId).toEqualTypeOf<string>()
      }

      @Stream(downloadText)
      async text() {}

      @Stream(downloadStream)
      async stream() {}
    }
  })

  test('rejects JSON and void declarations', () => {
    const define = () => {
      @Controller()
      class UserController {
        // @ts-expect-error - a JSON endpoint belongs to @Endpoint
        @Stream(getUser)
        async getUser() {}

        // @ts-expect-error - response: 'json' belongs to @Endpoint
        @Stream(createUser)
        async createUser() {}

        // @ts-expect-error - response: 'void' belongs to @Endpoint
        @Stream(deleteUser)
        async deleteUser() {}

        // @ts-expect-error - a responses map belongs to @Endpoint or @Multipart
        @Stream(putUser)
        async putUser() {}
      }
    }
    expectTypeOf(define).toBeFunction()
  })

  test('rejects non-Zod schemas', () => {
    const define = () => {
      const foreignStream = api.declareEndpoint({
        method: 'POST',
        url: '/foreign/stream',
        response: 'stream',
        requestSchema: foreignSchema,
      })

      @Controller()
      class ForeignController {
        // @ts-expect-error - requestSchema is not a Zod schema
        @Stream(foreignStream)
        async stream() {}
      }
    }
    expectTypeOf(define).toBeFunction()
  })
})
