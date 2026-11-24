import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { builder } from '@navios/builder'
import {
  Controller,
  HttpCode,
  Injectable,
  InjectableScope,
  inject,
  Module,
  Multipart,
  NaviosApplication,
  NaviosFactory,
  reply,
} from '@navios/core'
import supertest from 'supertest'
import { z } from 'zod/v4'

import type { MultipartParams, MultipartResult } from '@navios/core'

import { defineBunEnvironment } from '../../src/index.mjs'

import type { BunEnvironment } from '../../src/index.mjs'

describe('multipart endpoints: response: void and responses', () => {
  let server: NaviosApplication<BunEnvironment>
  let realServer: string

  const uploaded: string[] = []

  @Injectable({ scope: InjectableScope.Request })
  class RequestScopedService {
    readonly id = Math.random().toString(36).slice(2)
  }

  const fileSchema = z.object({ file: z.instanceof(File) })
  const reportSchema = z.object({ name: z.string(), size: z.number() })
  const createdSchema = z.object({ id: z.string() })

  const uploadAvatar = builder().declareEndpoint({
    url: '/users/$id/avatar',
    method: 'PUT',
    body: 'multipart',
    response: 'void',
    requestSchema: fileSchema,
  })
  const queueUpload = builder().declareEndpoint({
    url: '/uploads/queue',
    method: 'POST',
    body: 'multipart',
    response: 'void',
    requestSchema: fileSchema,
  })
  const leaky = builder().declareEndpoint({
    url: '/uploads/leaky',
    method: 'POST',
    body: 'multipart',
    response: 'void',
    requestSchema: fileSchema,
  })
  const scopedUpload = builder().declareEndpoint({
    url: '/scoped/$id',
    method: 'PUT',
    body: 'multipart',
    response: 'void',
    requestSchema: fileSchema,
  })
  const importFile = builder().declareEndpoint({
    url: '/imports',
    method: 'POST',
    body: 'multipart',
    requestSchema: z.object({ file: z.instanceof(File), mode: z.string().optional() }),
    responses: { 200: reportSchema, 201: createdSchema, 204: null },
  })
  const stripped = builder().declareEndpoint({
    url: '/imports/stripped',
    method: 'POST',
    body: 'multipart',
    requestSchema: fileSchema,
    responses: { 200: createdSchema },
  })
  const bareObject = builder().declareEndpoint({
    url: '/imports/bare-object',
    method: 'POST',
    body: 'multipart',
    requestSchema: fileSchema,
    responses: { 200: reportSchema },
  })
  const undeclaredStatus = builder().declareEndpoint({
    url: '/imports/undeclared-status',
    method: 'POST',
    body: 'multipart',
    requestSchema: fileSchema,
    responses: { 200: reportSchema },
  })

  @Controller()
  class UploadController {
    @Multipart(uploadAvatar)
    async uploadAvatar(
      req: MultipartParams<typeof uploadAvatar>,
    ): MultipartResult<typeof uploadAvatar> {
      uploaded.push(`${req.urlParams.id}:${req.data.file.name}`)
    }

    // A custom status still wins over the 204 default
    @Multipart(queueUpload)
    @HttpCode(202)
    async queueUpload(req: MultipartParams<typeof queueUpload>) {
      uploaded.push(`queued:${req.data.file.name}`)
    }

    // Not type-safe on purpose: whatever the method returns must not be sent
    // @ts-expect-error - a void endpoint must not return a value
    @Multipart(leaky)
    async leaky() {
      return { secret: 'do not send' }
    }

    @Multipart(importFile)
    async importFile(req: MultipartParams<typeof importFile>): MultipartResult<typeof importFile> {
      const { file, mode } = req.data
      if (file.size === 0) {
        return reply(204)
      }
      if (mode === 'create') {
        return reply(201, { id: file.name })
      }
      return reply(200, { name: file.name, size: file.size })
    }

    @Multipart(stripped)
    async stripped() {
      return reply(200, { id: '1', secret: 'do not send' })
    }

    // Not type-safe on purpose: a responses endpoint must return reply(...)
    // @ts-expect-error - a bare object is not a reply
    @Multipart(bareObject)
    async bareObject() {
      return { name: 'do not send', size: 1 }
    }

    // @ts-expect-error - 404 is not a declared status
    @Multipart(undeclaredStatus)
    async undeclaredStatus() {
      return reply(404, { name: 'do not send' })
    }
  }

  @Controller()
  class ScopedController {
    private scoped = inject(RequestScopedService)

    @Multipart(scopedUpload)
    async upload(req: MultipartParams<typeof scopedUpload>) {
      uploaded.push(`${req.urlParams.id}:${req.data.file.name}:${typeof this.scoped.id}`)
    }
  }

  @Module({
    controllers: [UploadController, ScopedController],
  })
  class UploadModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<BunEnvironment>(UploadModule, {
      adapter: defineBunEnvironment(),
    })
    await server.init()
    await server.listen({ port: 3022, hostname: 'localhost' })
    realServer = server.getServer().url.origin
  })

  afterAll(async () => {
    await server.close()
  })

  const file = (content = 'file content', name = 'test.txt') =>
    [Buffer.from(content), name] as const

  describe('response: void', () => {
    it('answers 204 with no body', async () => {
      const response = await supertest(realServer)
        .put('/users/42/avatar')
        .attach('file', ...file('png', 'avatar.png'))

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
      expect(response.headers['content-type']).toBeUndefined()
      expect(uploaded).toContain('42:avatar.png')
    })

    it('still validates the multipart body', async () => {
      const response = await supertest(realServer)
        .put('/users/42/avatar')
        .field('file', 'not a file')

      expect(response.status).toBe(400)
    })

    it('lets @HttpCode override the status', async () => {
      const response = await supertest(realServer)
        .post('/uploads/queue')
        .attach('file', ...file('data', 'queued.txt'))

      expect(response.status).toBe(202)
      expect(response.text).toBe('')
      expect(uploaded).toContain('queued:queued.txt')
    })

    it('never sends a value the method returned by mistake', async () => {
      const response = await supertest(realServer)
        .post('/uploads/leaky')
        .attach('file', ...file())

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
    })

    it('works for a request-scoped controller', async () => {
      const response = await supertest(realServer)
        .put('/scoped/9')
        .attach('file', ...file('data', 'scoped.txt'))

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
      expect(uploaded).toContain('9:scoped.txt:string')
    })
  })

  describe('responses', () => {
    it('answers with the status and body the method replied with', async () => {
      const ok = await supertest(realServer)
        .post('/imports')
        .attach('file', ...file('12345', 'users.csv'))

      expect(ok.status).toBe(200)
      expect(ok.headers['content-type']).toContain('application/json')
      expect(ok.body).toEqual({ name: 'users.csv', size: 5 })

      const created = await supertest(realServer)
        .post('/imports')
        .field('mode', 'create')
        .attach('file', ...file('12345', 'users.csv'))

      expect(created.status).toBe(201)
      expect(created.body).toEqual({ id: 'users.csv' })
    })

    it('sends no body for a status declared as null', async () => {
      const response = await supertest(realServer)
        .post('/imports')
        .attach('file', ...file('', 'empty.csv'))

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
      expect(response.headers['content-type']).toBeUndefined()
    })

    it('still validates the multipart body', async () => {
      const response = await supertest(realServer).post('/imports').field('file', 'not a file')

      expect(response.status).toBe(400)
    })

    it('validates the body with the schema of its status', async () => {
      const response = await supertest(realServer)
        .post('/imports/stripped')
        .attach('file', ...file())

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ id: '1' })
    })

    it('answers 500 when the method did not return a reply', async () => {
      const response = await supertest(realServer)
        .post('/imports/bare-object')
        .attach('file', ...file())

      expect(response.status).toBe(500)
      expect(response.text).not.toContain('do not send')
    })

    it('answers 500 when the method replied with an undeclared status', async () => {
      const response = await supertest(realServer)
        .post('/imports/undeclared-status')
        .attach('file', ...file())

      expect(response.status).toBe(500)
      expect(response.text).not.toContain('do not send')
    })
  })
})
