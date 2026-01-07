import type { NaviosApplication } from '@navios/core'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import supertest from 'supertest'

import { createApp } from '../src/bootstrap.mjs'

describe('Users API', () => {
  let server: NaviosApplication
  let baseUrl: string

  beforeAll(async () => {
    server = await createApp()
    await server.init()
    await server.listen({ port: 0, host: 'localhost' })
    baseUrl = server.getServer().url.href
  })

  afterAll(async () => {
    await server.close()
  })

  const request = () => supertest(baseUrl)

  describe('GET /users', () => {
    it('should return paginated users list (public endpoint)', async () => {
      const response = await request().get('/users').query({ page: 1, limit: 10 })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('users')
      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('page', 1)
      expect(response.body).toHaveProperty('limit', 10)
      expect(Array.isArray(response.body.users)).toBe(true)
    })

    it('should use default pagination when not specified', async () => {
      const response = await request().get('/users')

      expect(response.status).toBe(200)
      expect(response.body.page).toBe(1)
      expect(response.body.limit).toBe(20)
    })
  })

  describe('POST /users', () => {
    it('should create a new user with valid token', async () => {
      const response = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          role: 'user',
        })

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe('John Doe')
      expect(response.body.email).toBe('john@example.com')
      expect(response.body.role).toBe('user')
      expect(response.body).toHaveProperty('createdAt')
    })

    it('should reject without authorization', async () => {
      const response = await request().post('/users').send({
        name: 'Jane Doe',
        email: 'jane@example.com',
      })

      expect(response.status).toBe(401)
    })

    it('should return 400 for invalid email', async () => {
      const response = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Invalid User',
          email: 'not-an-email',
        })

      expect(response.status).toBe(400)
    })

    it('should return 400 for missing required fields', async () => {
      const response = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Missing Email' })

      expect(response.status).toBe(400)
    })

    it('should use default role when not specified', async () => {
      const response = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Default Role User',
          email: 'default@example.com',
        })

      expect(response.status).toBe(201)
      expect(response.body.role).toBe('user')
    })
  })

  describe('GET /users/:id', () => {
    it('should return user by id (public endpoint)', async () => {
      // First create a user
      const createResponse = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Test User', email: 'test@example.com' })

      const userId = createResponse.body.id

      const response = await request().get(`/users/${userId}`)

      expect(response.status).toBe(200)
      expect(response.body.id).toBe(userId)
      expect(response.body.name).toBe('Test User')
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request().get('/users/non-existent-id')

      expect(response.status).toBe(404)
    })
  })

  describe('PUT /users/:id', () => {
    it('should update user', async () => {
      // Create user first
      const createResponse = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Original Name', email: 'original@test.com' })

      const userId = createResponse.body.id

      const response = await request()
        .put(`/users/${userId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Name' })

      expect(response.status).toBe(200)
      expect(response.body.name).toBe('Updated Name')
      expect(response.body.email).toBe('original@test.com')
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request()
        .put('/users/non-existent-id')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated' })

      expect(response.status).toBe(404)
    })

    it('should reject without authorization', async () => {
      const response = await request().put('/users/some-id').send({ name: 'Updated' })

      expect(response.status).toBe(401)
    })
  })

  describe('DELETE /users/:id', () => {
    it('should delete user', async () => {
      // Create user first
      const createResponse = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'To Delete', email: 'delete@test.com' })

      const userId = createResponse.body.id

      const response = await request()
        .delete(`/users/${userId}`)
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // Verify deletion
      const getResponse = await request().get(`/users/${userId}`)
      expect(getResponse.status).toBe(404)
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request()
        .delete('/users/non-existent-id')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(404)
    })
  })
})
