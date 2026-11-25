import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import supertest from 'supertest'

import { createApp } from '../src/bootstrap.mjs'

describe('Guards and Authentication', () => {
  let server: Awaited<ReturnType<typeof createApp>>
  let baseUrl: string

  beforeAll(async () => {
    server = await createApp()
    baseUrl = await server.listen({ port: 0, hostname: '127.0.0.1' })
  })

  afterAll(async () => {
    await server.close()
  })

  const request = () => supertest(baseUrl)

  describe('Public endpoints', () => {
    it('should allow access to health endpoint without auth', async () => {
      const response = await request().get('/health')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('ok')
      expect(response.body).toHaveProperty('timestamp')
    })

    it('should allow access to GET /users without auth', async () => {
      const response = await request().get('/users')

      expect(response.status).toBe(200)
    })

    it('should allow access to GET /posts without auth', async () => {
      const response = await request().get('/posts')

      expect(response.status).toBe(200)
    })

    it('should allow access to streaming endpoints without auth', async () => {
      const response = await request().get('/events/stream')

      expect(response.status).toBe(200)
    })
  })

  describe('Protected endpoints', () => {
    it('should reject access to protected endpoint without auth', async () => {
      const response = await request().get('/test/protected')

      expect(response.status).toBe(401)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing authorization header',
      })
    })

    it('should allow access to protected endpoint with valid token', async () => {
      const response = await request()
        .get('/test/protected')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body.data).toBe('secret data')
    })

    it('should expose the user set by the guard to the handler', async () => {
      const response = await request()
        .get('/test/whoami')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ id: 'user-from-token', role: 'admin' })
    })

    it('should reject with invalid token format', async () => {
      const response = await request()
        .get('/test/protected')
        .set('Authorization', 'InvalidFormat token')

      expect(response.status).toBe(401)
    })

    it('should reject with invalid token value', async () => {
      const response = await request()
        .get('/test/protected')
        .set('Authorization', 'Bearer invalid-token')

      expect(response.status).toBe(401)
    })
  })

  describe('Error handling endpoints', () => {
    it('should return 400 for validation error', async () => {
      const response = await request().post('/test/validation-error').send({}) // Missing requiredField

      expect(response.status).toBe(400)
      expect(response.body.source).toBe('body')
      expect(response.body.errors).toEqual([{ path: 'requiredField', message: expect.any(String) }])
    })

    it('should return 200 for valid request', async () => {
      const response = await request()
        .post('/test/validation-error')
        .send({ requiredField: 'present' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('should return 404 for not found endpoint', async () => {
      const response = await request().get('/test/not-found/any-id')

      expect(response.status).toBe(404)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.body.detail).toBe('Resource with id any-id not found')
    })
  })

  describe('CORS (adapter option)', () => {
    it('should answer a preflight request', async () => {
      const response = await request()
        .options('/users')
        .set('Origin', 'http://client.test')
        .set('Access-Control-Request-Method', 'POST')

      expect(response.status).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBe('http://client.test')
      expect(response.headers['access-control-allow-methods']).toContain('POST')
    })

    it('should add CORS headers to responses', async () => {
      const response = await request().get('/health').set('Origin', 'http://client.test')

      expect(response.status).toBe(200)
      expect(response.headers['access-control-allow-origin']).toBe('http://client.test')
    })
  })

  describe('CRUD operations require auth', () => {
    it('should reject POST /users without auth', async () => {
      const response = await request().post('/users').send({ name: 'Test', email: 'test@test.com' })

      expect(response.status).toBe(401)
    })

    it('should reject PUT /users/:id without auth', async () => {
      const response = await request().put('/users/some-id').send({ name: 'Updated' })

      expect(response.status).toBe(401)
    })

    it('should reject DELETE /users/:id without auth', async () => {
      const response = await request().delete('/users/some-id')

      expect(response.status).toBe(401)
    })

    it('should reject POST /posts without auth', async () => {
      const response = await request().post('/posts').send({
        title: 'Test Post',
        content: 'Test content for the post',
        authorId: 'author-1',
      })

      expect(response.status).toBe(401)
    })

    it('should reject file upload without auth', async () => {
      const response = await request()
        .post('/files/upload')
        .attach('file', Buffer.from('content'), 'test.txt')

      expect(response.status).toBe(401)
    })
  })
})
