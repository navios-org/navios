import { builder } from '@navios/builder'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Controller, Endpoint, HttpCode, Multipart, Stream } from '../decorators/index.mjs'
import { extractControllerMetadata } from '../index.mjs'
import {
  Controller as LegacyController,
  Endpoint as LegacyEndpoint,
  HttpCode as LegacyHttpCode,
  Multipart as LegacyMultipart,
  Stream as LegacyStream,
} from '../legacy-compat/index.mjs'
import { EndpointAdapterToken, MultipartAdapterToken } from '../tokens/index.mjs'
import { isEndpointReply, reply, resolveEndpointReply } from '../utils/index.mjs'

import type { EndpointResult, MultipartResult } from '../decorators/index.mjs'

const api = builder()
const responseSchema = z.object({ ok: z.boolean() })

const jsonEndpoint = api.declareEndpoint({ method: 'GET', url: '/json', responseSchema })
const explicitJsonEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/json',
  body: 'json',
  response: 'json',
  responseSchema,
})
const voidEndpoint = api.declareEndpoint({ method: 'DELETE', url: '/items/$id', response: 'void' })
const multipartEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/upload',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema,
})
const fileSchema = z.object({ file: z.instanceof(File) })
const voidMultipartEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/items/$id/image',
  body: 'multipart',
  response: 'void',
  requestSchema: fileSchema,
})
const responsesMultipartEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/items/import',
  body: 'multipart',
  requestSchema: fileSchema,
  responses: { 200: responseSchema, 204: null },
})
const blobEndpoint = api.declareEndpoint({ method: 'GET', url: '/blob', response: 'blob' })
const textEndpoint = api.declareEndpoint({ method: 'GET', url: '/text', response: 'text' })
const streamEndpoint = api.declareEndpoint({ method: 'GET', url: '/stream', response: 'stream' })

function onlyHandler(controller: new () => unknown) {
  const [handler] = extractControllerMetadata(controller).endpoints
  return handler
}

describe('response: void endpoints', () => {
  it('@Endpoint accepts a void endpoint and answers 204 by default', () => {
    @Controller()
    class Test {
      @Endpoint(voidEndpoint)
      async remove() {}
    }

    const handler = onlyHandler(Test)
    expect(handler.adapterToken).toBe(EndpointAdapterToken)
    expect(handler.config).toBe(voidEndpoint.config)
    expect(handler.successStatusCode).toBe(204)
  })

  it('keeps 200 for JSON endpoints', () => {
    @Controller()
    class Test {
      @Endpoint(jsonEndpoint)
      async get() {
        return { ok: true }
      }
    }

    expect(onlyHandler(Test).successStatusCode).toBe(200)
  })

  it('@HttpCode wins when it is applied before @Endpoint', () => {
    @Controller()
    class Test {
      @Endpoint(voidEndpoint)
      @HttpCode(202)
      async remove() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(202)
  })

  it('@HttpCode wins when it is applied after @Endpoint', () => {
    @Controller()
    class Test {
      @HttpCode(202)
      @Endpoint(voidEndpoint)
      async remove() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(202)
  })

  it('an explicit @HttpCode(200) is not replaced by the 204 default', () => {
    @Controller()
    class Test {
      @Endpoint(voidEndpoint)
      @HttpCode(200)
      async remove() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(200)
  })

  it('works with the legacy decorators', () => {
    type Params = { urlParams: { id: string } }
    class Test {
      async remove(_params: Params) {}
      async archive(_params: Params) {}
    }
    const archiveEndpoint = api.declareEndpoint({
      method: 'POST',
      url: '/items/$id/archive',
      response: 'void',
    })
    const descriptorOf = (name: 'remove' | 'archive') =>
      Object.getOwnPropertyDescriptor(Test.prototype, name) as TypedPropertyDescriptor<
        (params: Params) => Promise<void>
      >

    LegacyEndpoint(voidEndpoint)(Test.prototype, 'remove', descriptorOf('remove'))
    LegacyHttpCode(202)(Test.prototype, 'archive', descriptorOf('archive'))
    LegacyEndpoint(archiveEndpoint)(Test.prototype, 'archive', descriptorOf('archive'))
    LegacyController()(Test)

    const handlers = [...extractControllerMetadata(Test).endpoints]
    expect(handlers.find((h) => h.classMethod === 'remove')?.successStatusCode).toBe(204)
    expect(handlers.find((h) => h.classMethod === 'archive')?.successStatusCode).toBe(202)
  })
})

describe('responses endpoints', () => {
  const responsesEndpoint = api.declareEndpoint({
    method: 'PUT',
    url: '/items/$id',
    responses: { 200: responseSchema, 204: null },
  })
  const httpCodeError =
    '[Navios] @HttpCode cannot be used on PUT /items/$id: the endpoint is declared with a per-status responses map, so its method picks the status with reply(status, body). Remove @HttpCode.'

  it('@Endpoint accepts a declaration with a responses map', () => {
    @Controller()
    class Test {
      @Endpoint(responsesEndpoint)
      async put() {
        return reply(204)
      }
    }

    const handler = onlyHandler(Test)
    expect(handler.adapterToken).toBe(EndpointAdapterToken)
    expect(handler.config).toBe(responsesEndpoint.config)
  })

  it('@HttpCode throws when it is applied before @Endpoint', () => {
    expect(() => {
      class Test {
        @Endpoint(responsesEndpoint)
        @HttpCode(201)
        async put() {
          return reply(204)
        }
      }
      return Test
    }).toThrow(httpCodeError)
  })

  it('@HttpCode throws when it is applied after @Endpoint', () => {
    expect(() => {
      class Test {
        @HttpCode(201)
        @Endpoint(responsesEndpoint)
        async put() {
          return reply(204)
        }
      }
      return Test
    }).toThrow(httpCodeError)
  })

  it('works with the legacy decorators, which reject @HttpCode in both orders', () => {
    class Test {
      async put() {
        return reply(204)
      }
      async before() {
        return reply(204)
      }
      async after() {
        return reply(204)
      }
    }
    const descriptorOf = (name: 'put' | 'before' | 'after') =>
      Object.getOwnPropertyDescriptor(Test.prototype, name) as TypedPropertyDescriptor<
        (params: { urlParams: { id: string } }) => EndpointResult<typeof responsesEndpoint>
      >

    LegacyEndpoint(responsesEndpoint)(Test.prototype, 'put', descriptorOf('put'))

    LegacyHttpCode(201)(Test.prototype, 'before', descriptorOf('before'))
    expect(() =>
      LegacyEndpoint(responsesEndpoint)(Test.prototype, 'before', descriptorOf('before')),
    ).toThrow(httpCodeError)

    LegacyEndpoint(responsesEndpoint)(Test.prototype, 'after', descriptorOf('after'))
    expect(() => LegacyHttpCode(201)(Test.prototype, 'after', descriptorOf('after'))).toThrow(
      httpCodeError,
    )

    LegacyController()(Test)
    const handlers = [...extractControllerMetadata(Test).endpoints]
    expect(handlers.find((h) => h.classMethod === 'put')?.config).toBe(responsesEndpoint.config)
  })

  it('@HttpCode still works on endpoints without a responses map', () => {
    @Controller()
    class Test {
      @HttpCode(201)
      @Endpoint(jsonEndpoint)
      async get() {
        return { ok: true }
      }
    }

    expect(onlyHandler(Test).successStatusCode).toBe(201)
  })

  it('@Endpoint rejects a responses map combined with response: void', () => {
    const both = { ...voidEndpoint, config: { ...voidEndpoint.config, responses: { 204: null } } }
    expect(() => {
      class Test {
        // @ts-expect-error - a void endpoint has no responses map
        @Endpoint(both)
        async remove() {}
      }
      return Test
    }).toThrow(
      "[Navios] @Endpoint cannot serve DELETE /items/$id: the endpoint is declared with both a per-status responses map and response: 'void'. Keep one of them: a status without a body is a null entry in responses.",
    )
  })

  it('@Stream rejects a responses map', () => {
    expect(() => {
      class Test {
        // @ts-expect-error - a responses map belongs to @Endpoint or @Multipart
        @Stream(responsesEndpoint)
        async put() {}
      }
      return Test
    }).toThrow(
      '[Navios] @Stream cannot serve PUT /items/$id: the endpoint is declared with a per-status responses map, which only @Endpoint and @Multipart serve. Change the declaration or use one of them.',
    )
  })

  it('@Multipart rejects a responses map without body: multipart', () => {
    expect(() => {
      class Test {
        // @ts-expect-error - declared without body: 'multipart'
        @Multipart(responsesEndpoint)
        async put() {
          return reply(204)
        }
      }
      return Test
    }).toThrow(
      "[Navios] @Multipart cannot serve PUT /items/$id: the endpoint is declared without a body option (so body: 'json'), but @Multipart needs body: 'multipart'. Change the declaration or use @Endpoint.",
    )
  })
})

describe('@Multipart response: void endpoints', () => {
  it('accepts a void endpoint and answers 204 by default', () => {
    @Controller()
    class Test {
      @Multipart(voidMultipartEndpoint)
      async upload() {}
    }

    const handler = onlyHandler(Test)
    expect(handler.adapterToken).toBe(MultipartAdapterToken)
    expect(handler.config).toBe(voidMultipartEndpoint.config)
    expect(handler.successStatusCode).toBe(204)
  })

  it('keeps 200 for JSON multipart endpoints', () => {
    @Controller()
    class Test {
      @Multipart(multipartEndpoint)
      async upload() {
        return { ok: true }
      }
    }

    expect(onlyHandler(Test).successStatusCode).toBe(200)
  })

  it('@HttpCode wins when it is applied before @Multipart', () => {
    @Controller()
    class Test {
      @Multipart(voidMultipartEndpoint)
      @HttpCode(202)
      async upload() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(202)
  })

  it('@HttpCode wins when it is applied after @Multipart', () => {
    @Controller()
    class Test {
      @HttpCode(202)
      @Multipart(voidMultipartEndpoint)
      async upload() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(202)
  })

  it('an explicit @HttpCode(200) is not replaced by the 204 default', () => {
    @Controller()
    class Test {
      @Multipart(voidMultipartEndpoint)
      @HttpCode(200)
      async upload() {}
    }

    expect(onlyHandler(Test).successStatusCode).toBe(200)
  })

  it('works with the legacy decorators', () => {
    type Params = { urlParams: { id: string }; data: { file: File } }
    class Test {
      async upload(_params: Params) {}
      async accepted(_params: Params) {}
    }
    const acceptedEndpoint = api.declareEndpoint({
      method: 'POST',
      url: '/items/$id/image',
      body: 'multipart',
      response: 'void',
      requestSchema: fileSchema,
    })
    const descriptorOf = (name: 'upload' | 'accepted') =>
      Object.getOwnPropertyDescriptor(Test.prototype, name) as TypedPropertyDescriptor<
        (params: Params) => Promise<void>
      >

    LegacyMultipart(voidMultipartEndpoint)(Test.prototype, 'upload', descriptorOf('upload'))
    LegacyHttpCode(202)(Test.prototype, 'accepted', descriptorOf('accepted'))
    LegacyMultipart(acceptedEndpoint)(Test.prototype, 'accepted', descriptorOf('accepted'))
    LegacyController()(Test)

    const handlers = [...extractControllerMetadata(Test).endpoints]
    expect(handlers.find((h) => h.classMethod === 'upload')?.successStatusCode).toBe(204)
    expect(handlers.find((h) => h.classMethod === 'accepted')?.successStatusCode).toBe(202)
  })
})

describe('@Multipart responses endpoints', () => {
  const httpCodeError =
    '[Navios] @HttpCode cannot be used on POST /items/import: the endpoint is declared with a per-status responses map, so its method picks the status with reply(status, body). Remove @HttpCode.'

  it('accepts a declaration with a responses map', () => {
    @Controller()
    class Test {
      @Multipart(responsesMultipartEndpoint)
      async importItems() {
        return reply(204)
      }
    }

    const handler = onlyHandler(Test)
    expect(handler.adapterToken).toBe(MultipartAdapterToken)
    expect(handler.config).toBe(responsesMultipartEndpoint.config)
    // The status comes from reply(); the default is left alone
    expect(handler.successStatusCode).toBe(200)
  })

  it('@HttpCode throws when it is applied before @Multipart', () => {
    expect(() => {
      class Test {
        @Multipart(responsesMultipartEndpoint)
        @HttpCode(201)
        async importItems() {
          return reply(204)
        }
      }
      return Test
    }).toThrow(httpCodeError)
  })

  it('@HttpCode throws when it is applied after @Multipart', () => {
    expect(() => {
      class Test {
        @HttpCode(201)
        @Multipart(responsesMultipartEndpoint)
        async importItems() {
          return reply(204)
        }
      }
      return Test
    }).toThrow(httpCodeError)
  })

  it('works with the legacy decorators, which reject @HttpCode in both orders', () => {
    class Test {
      async importItems() {
        return reply(204)
      }
      async before() {
        return reply(204)
      }
      async after() {
        return reply(204)
      }
    }
    const descriptorOf = (name: 'importItems' | 'before' | 'after') =>
      Object.getOwnPropertyDescriptor(Test.prototype, name) as TypedPropertyDescriptor<
        (params: { data: { file: File } }) => MultipartResult<typeof responsesMultipartEndpoint>
      >

    LegacyMultipart(responsesMultipartEndpoint)(
      Test.prototype,
      'importItems',
      descriptorOf('importItems'),
    )

    LegacyHttpCode(201)(Test.prototype, 'before', descriptorOf('before'))
    expect(() =>
      LegacyMultipart(responsesMultipartEndpoint)(Test.prototype, 'before', descriptorOf('before')),
    ).toThrow(httpCodeError)

    LegacyMultipart(responsesMultipartEndpoint)(Test.prototype, 'after', descriptorOf('after'))
    expect(() => LegacyHttpCode(201)(Test.prototype, 'after', descriptorOf('after'))).toThrow(
      httpCodeError,
    )

    LegacyController()(Test)
    const handlers = [...extractControllerMetadata(Test).endpoints]
    expect(handlers.find((h) => h.classMethod === 'importItems')?.config).toBe(
      responsesMultipartEndpoint.config,
    )
  })

  it('rejects a responses map combined with response: void', () => {
    const both = {
      ...voidMultipartEndpoint,
      config: { ...voidMultipartEndpoint.config, responses: { 204: null } },
    }
    expect(() => {
      class Test {
        // @ts-expect-error - a void endpoint has no responses map
        @Multipart(both)
        async upload() {}
      }
      return Test
    }).toThrow(
      "[Navios] @Multipart cannot serve PUT /items/$id/image: the endpoint is declared with both a per-status responses map and response: 'void'. Keep one of them: a status without a body is a null entry in responses.",
    )
  })
})

describe('reply', () => {
  it('carries the status and the body', () => {
    const body = { ok: true }
    const result = reply(200, body)

    expect(result.status).toBe(200)
    expect(result.body).toBe(body)
    expect(reply(204).body).toBeUndefined()
  })

  it('is recognised by isEndpointReply, unlike look-alike values', () => {
    expect(isEndpointReply(reply(204))).toBe(true)
    expect(isEndpointReply(reply(200, { ok: true }))).toBe(true)

    expect(isEndpointReply({ status: 200, body: { ok: true } })).toBe(false)
    expect(isEndpointReply(undefined)).toBe(false)
    expect(isEndpointReply(null)).toBe(false)
    expect(isEndpointReply('reply')).toBe(false)
  })
})

describe('resolveEndpointReply', () => {
  const config = {
    method: 'PUT',
    url: '/items/$id',
    responses: { 200: responseSchema, 204: null },
  }

  it('returns the status, its schema and the body', () => {
    const body = { ok: true }

    expect(resolveEndpointReply(config, reply(200, body))).toEqual({
      status: 200,
      schema: responseSchema,
      body,
    })
    expect(resolveEndpointReply(config, reply(204))).toEqual({
      status: 204,
      schema: null,
      body: undefined,
    })
  })

  it.each([
    ['a bare object', { ok: true }, 'a value of type object'],
    ['nothing', undefined, 'a value of type undefined'],
    ['null', null, 'null'],
    ['an array', [reply(204)], 'an array'],
  ])('throws when the handler returned %s', (_name, result, returned) => {
    expect(() => resolveEndpointReply(config, result)).toThrow(
      `[Navios] PUT /items/$id is declared with a per-status responses map, so its handler must return reply(status, body), but it returned ${returned}.`,
    )
  })

  it('throws when the status is not declared', () => {
    expect(() => resolveEndpointReply(config, reply(404, { message: 'no' }))).toThrow(
      '[Navios] PUT /items/$id replied with status 404, which is not in its responses map (declared: 200, 204).',
    )
    // Inherited properties are not statuses
    expect(() => resolveEndpointReply(config, reply('toString' as unknown as number))).toThrow(
      'which is not in its responses map',
    )
  })
})

describe('decorator / declaration agreement', () => {
  // The type system already rejects every combination below, so each
  // application carries a @ts-expect-error; the runtime check is what
  // protects untyped callers and `any`-typed declarations.

  describe('@Endpoint', () => {
    it('accepts JSON declarations, with or without explicit kinds', () => {
      expect(() => {
        class Test {
          @Endpoint(jsonEndpoint)
          async a() {
            return { ok: true }
          }

          @Endpoint(explicitJsonEndpoint)
          async b() {
            return { ok: true }
          }
        }
        return Test
      }).not.toThrow()
    })

    it('rejects body: multipart', () => {
      expect(() => {
        class Test {
          // @ts-expect-error - body: 'multipart' belongs to @Multipart
          @Endpoint(multipartEndpoint)
          async upload() {
            return { ok: true }
          }
        }
        return Test
      }).toThrow(
        "[Navios] @Endpoint cannot serve POST /upload: the endpoint is declared with body: 'multipart', but @Endpoint needs body: 'json' (or no body option). Change the declaration or use @Multipart.",
      )
    })

    it.each([
      ['blob', blobEndpoint],
      ['text', textEndpoint],
      ['stream', streamEndpoint],
    ] as const)('rejects response: %s', (kind, endpoint) => {
      expect(() => {
        class Test {
          // @ts-expect-error - stream kinds belong to @Stream
          @Endpoint(endpoint)
          async download() {}
        }
        return Test
      }).toThrow(
        `[Navios] @Endpoint cannot serve GET /${kind}: the endpoint is declared with response: '${kind}', but @Endpoint needs response: 'json' or 'void' (or no response option). Change the declaration or use @Stream.`,
      )
    })
  })

  describe('@Multipart', () => {
    it('accepts body: multipart', () => {
      expect(() => {
        class Test {
          @Multipart(multipartEndpoint)
          async upload() {
            return { ok: true }
          }
        }
        return Test
      }).not.toThrow()
    })

    it('rejects a declaration without a body option', () => {
      expect(() => {
        class Test {
          // @ts-expect-error - declared without body: 'multipart'
          @Multipart(jsonEndpoint)
          async upload() {
            return { ok: true }
          }
        }
        return Test
      }).toThrow(
        "[Navios] @Multipart cannot serve GET /json: the endpoint is declared without a body option (so body: 'json'), but @Multipart needs body: 'multipart'. Change the declaration or use @Endpoint.",
      )
    })

    it('rejects body: json', () => {
      expect(() => {
        class Test {
          // @ts-expect-error - body: 'json'
          @Multipart(explicitJsonEndpoint)
          async upload() {
            return { ok: true }
          }
        }
        return Test
      }).toThrow(
        "[Navios] @Multipart cannot serve POST /json: the endpoint is declared with body: 'json', but @Multipart needs body: 'multipart'.",
      )
    })
  })

  describe('@Multipart response', () => {
    it('accepts JSON, void and responses declarations', () => {
      expect(() => {
        class Test {
          @Multipart(multipartEndpoint)
          async a() {
            return { ok: true }
          }

          @Multipart(voidMultipartEndpoint)
          async b() {}

          @Multipart(responsesMultipartEndpoint)
          async c() {
            return reply(204)
          }
        }
        return Test
      }).not.toThrow()
    })

    it.each(['blob', 'text', 'stream'] as const)('rejects response: %s', (kind) => {
      const convert = api.declareEndpoint({
        method: 'POST',
        url: '/convert',
        body: 'multipart',
        response: kind,
        requestSchema: fileSchema,
      })

      expect(() => {
        class Test {
          // @ts-expect-error - @Multipart does not serve blob, text or stream responses
          @Multipart(convert)
          async convert() {}
        }
        return Test
      }).toThrow(
        `[Navios] @Multipart cannot serve POST /convert: the endpoint is declared with response: '${kind}', but @Multipart needs response: 'json' or 'void' (or no response option). Change the declaration.`,
      )
    })
  })

  describe('@Stream', () => {
    it('accepts response: blob, text and stream', () => {
      expect(() => {
        class Test {
          @Stream(blobEndpoint)
          async a() {}

          @Stream(textEndpoint)
          async b() {}

          @Stream(streamEndpoint)
          async c() {}
        }
        return Test
      }).not.toThrow()
    })

    it('rejects a declaration without a response option', () => {
      expect(() => {
        class Test {
          // @ts-expect-error - a JSON endpoint belongs to @Endpoint
          @Stream(jsonEndpoint)
          async get() {}
        }
        return Test
      }).toThrow(
        "[Navios] @Stream cannot serve GET /json: the endpoint is declared without a response option (so response: 'json'), but @Stream needs response: 'blob', 'text' or 'stream'. Change the declaration or use @Endpoint.",
      )
    })

    it('rejects response: void', () => {
      expect(() => {
        class Test {
          // @ts-expect-error - response: 'void' belongs to @Endpoint
          @Stream(voidEndpoint)
          async remove() {}
        }
        return Test
      }).toThrow(
        "[Navios] @Stream cannot serve DELETE /items/$id: the endpoint is declared with response: 'void', but @Stream needs response: 'blob', 'text' or 'stream'. Change the declaration or use @Endpoint.",
      )
    })
  })

  describe('legacy decorators', () => {
    class Test {
      async method() {}
    }
    const descriptor = () =>
      Object.getOwnPropertyDescriptor(Test.prototype, 'method') as TypedPropertyDescriptor<
        () => Promise<never>
      >

    it('@Endpoint rejects a stream declaration', () => {
      expect(() =>
        // @ts-expect-error - response: 'blob' belongs to @Stream
        LegacyEndpoint(blobEndpoint)(Test.prototype, 'method', descriptor()),
      ).toThrow("@Endpoint cannot serve GET /blob: the endpoint is declared with response: 'blob'")
    })

    it('@Multipart rejects a JSON declaration', () => {
      expect(() =>
        // @ts-expect-error - declared without body: 'multipart'
        LegacyMultipart(jsonEndpoint)(Test.prototype, 'method', descriptor()),
      ).toThrow('@Multipart cannot serve GET /json: the endpoint is declared without a body option')
    })

    it('@Stream rejects a void declaration', () => {
      expect(() =>
        // @ts-expect-error - response: 'void' belongs to @Endpoint
        LegacyStream(voidEndpoint)(Test.prototype, 'method', descriptor()),
      ).toThrow(
        "@Stream cannot serve DELETE /items/$id: the endpoint is declared with response: 'void'",
      )
    })
  })
})
