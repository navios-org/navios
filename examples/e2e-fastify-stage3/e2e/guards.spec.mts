import type { NaviosApplication } from '@navios/core'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/bootstrap.mjs'

describe('Guards and Authentication', () => {
  let server: NaviosApplication

  beforeAll(async () => {
    server = await createApp()
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  const request = () => supertest(server.getServer().server)

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
    })

    it('should allow access to protected endpoint with valid token', async () => {
      const response = await request()
        .get('/test/protected')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body.data).toBe('secret data')
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
      const response = await request()
        .post('/test/validation-error')
        .send({}) // Missing requiredField

      expect(response.status).toBe(400)
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
    })
  })

  describe('CRUD operations require auth', () => {
    it('should reject POST /users without auth', async () => {
      const response = await request()
        .post('/users')
        .send({ name: 'Test', email: 'test@test.com' })

      expect(response.status).toBe(401)
    })

    it('should reject PUT /users/:id without auth', async () => {
      const response = await request()
        .put('/users/some-id')
        .send({ name: 'Updated' })

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
