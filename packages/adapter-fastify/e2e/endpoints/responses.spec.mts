import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  Injectable,
  InjectableScope,
  inject,
  Module,
  NaviosApplication,
  NaviosFactory,
  reply,
} from '@navios/core'
import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointParams, EndpointResult } from '@navios/core'

import { defineFastifyEnvironment } from '../../src/index.mjs'

import type { FastifyEnvironment } from '../../src/index.mjs'

describe('responses endpoints', () => {
  let server: NaviosApplication<FastifyEnvironment>
  const users = new Map<string, { id: string; name: string }>()

  @Injectable({ scope: InjectableScope.Request })
  class RequestScopedService {
    readonly id = Math.random().toString(36).slice(2)
  }

  const userSchema = z.object({ id: z.string(), name: z.string() })
  const createdSchema = z.object({ id: z.string() })

  const putUser = builder().declareEndpoint({
    url: '/users/$id',
    method: 'PUT',
    requestSchema: z.object({ name: z.string() }),
    responses: { 200: userSchema, 201: createdSchema, 204: null },
  })
  const ping = builder().declareEndpoint({
    url: '/ping',
    method: 'POST',
    responses: { 202: null },
  })
  const stripped = builder().declareEndpoint({
    url: '/stripped',
    method: 'GET',
    responses: { 200: createdSchema },
  })
  const invalidBody = builder().declareEndpoint({
    url: '/invalid-body',
    method: 'GET',
    responses: { 200: userSchema, 201: createdSchema },
  })
  const bareObject = builder().declareEndpoint({
    url: '/bare-object',
    method: 'GET',
    responses: { 200: userSchema },
  })
  const undeclaredStatus = builder().declareEndpoint({
    url: '/undeclared-status',
    method: 'GET',
    responses: { 200: userSchema },
  })
  const scopedPut = builder().declareEndpoint({
    url: '/scoped/$id',
    method: 'PUT',
    responses: { 200: createdSchema, 204: null },
  })

  @Controller()
  class UsersController {
    @Endpoint(putUser)
    async putUser(req: EndpointParams<typeof putUser>): EndpointResult<typeof putUser> {
      const { id } = req.urlParams
      const existing = users.get(id)
      if (!existing) {
        users.set(id, { id, name: req.data.name })
        return reply(201, { id })
      }
      if (existing.name === req.data.name) {
        return reply(204)
      }
      existing.name = req.data.name
      return reply(200, existing)
    }

    // Synchronous, no arguments, no return annotation
    @Endpoint(ping)
    ping() {
      return reply(202)
    }

    @Endpoint(stripped)
    async stripped() {
      return reply(200, { id: '1', secret: 'do not send' })
    }

    // Not type-safe on purpose: the body of status 201 sent with status 200
    // @ts-expect-error - the body does not match the schema of status 200
    @Endpoint(invalidBody)
    async invalidBody() {
      return reply(200, { id: '1' })
    }

    // Not type-safe on purpose: a responses endpoint must return reply(...)
    // @ts-expect-error - a bare object is not a reply
    @Endpoint(bareObject)
    async bareObject() {
      return { id: '1', name: 'do not send' }
    }

    // @ts-expect-error - 404 is not a declared status
    @Endpoint(undeclaredStatus)
    async undeclaredStatus() {
      return reply(404, { name: 'do not send' })
    }
  }

  @Controller()
  class ScopedController {
    private scoped = inject(RequestScopedService)

    @Endpoint(scopedPut)
    async put(req: EndpointParams<typeof scopedPut>) {
      return req.urlParams.id === 'none' ? reply(204) : reply(200, { id: typeof this.scoped.id })
    }
  }

  @Module({
    controllers: [UsersController, ScopedController],
  })
  class UsersModule {}

  beforeAll(async () => {
    server = await NaviosFactory.create<FastifyEnvironment>(UsersModule, {
      adapter: defineFastifyEnvironment(),
      // The Fastify adapter validates responses only when this is set
      validateResponses: true,
    })
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  it('answers with the status and body the method replied with', async () => {
    const created = await supertest(server.getServer().server)
      .put('/users/1')
      .send({ name: 'John' })

    expect(created.status).toBe(201)
    expect(created.headers['content-type']).toContain('application/json')
    expect(created.body).toEqual({ id: '1' })

    const updated = await supertest(server.getServer().server)
      .put('/users/1')
      .send({ name: 'Jane' })

    expect(updated.status).toBe(200)
    expect(updated.body).toEqual({ id: '1', name: 'Jane' })
  })

  it('sends no body for a status declared as null', async () => {
    await supertest(server.getServer().server).put('/users/2').send({ name: 'Same' })
    const unchanged = await supertest(server.getServer().server)
      .put('/users/2')
      .send({ name: 'Same' })

    expect(unchanged.status).toBe(204)
    expect(unchanged.text).toBe('')
    expect(unchanged.headers['content-type']).toBeUndefined()
  })

  it('still validates the request body', async () => {
    const response = await supertest(server.getServer().server).put('/users/3').send({ name: 42 })

    expect(response.status).toBe(400)
  })

  it('works for a synchronous method without arguments', async () => {
    const response = await supertest(server.getServer().server).post('/ping')

    expect(response.status).toBe(202)
    expect(response.text).toBe('')
  })

  it('validates the body with the schema of its status', async () => {
    const response = await supertest(server.getServer().server).get('/stripped')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: '1' })
  })

  it('does not send a body that fails the schema of its status', async () => {
    const response = await supertest(server.getServer().server).get('/invalid-body')

    // Fastify's serializer rejects the body, exactly like a body that fails
    // `responseSchema`
    expect(response.status).toBe(500)
    expect(response.body).not.toEqual({ id: '1' })
  })

  it('answers 500 when the method did not return a reply', async () => {
    const response = await supertest(server.getServer().server).get('/bare-object')

    expect(response.status).toBe(500)
    expect(response.text).toContain('GET /bare-object')
    expect(response.text).not.toContain('do not send')
  })

  it('answers 500 when the method replied with an undeclared status', async () => {
    const response = await supertest(server.getServer().server).get('/undeclared-status')

    expect(response.status).toBe(500)
    expect(response.text).toContain('GET /undeclared-status replied with status 404')
    expect(response.text).not.toContain('do not send')
  })

  it('works for a request-scoped controller', async () => {
    const withBody = await supertest(server.getServer().server).put('/scoped/9')

    expect(withBody.status).toBe(200)
    expect(withBody.body).toEqual({ id: 'string' })

    const withoutBody = await supertest(server.getServer().server).put('/scoped/none')

    expect(withoutBody.status).toBe(204)
    expect(withoutBody.text).toBe('')
  })
})
