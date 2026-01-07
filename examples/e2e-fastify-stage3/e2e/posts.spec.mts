import type { NaviosApplication } from '@navios/core'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/bootstrap.mjs'

describe('Posts API', () => {
  let server: NaviosApplication

  beforeAll(async () => {
    server = await createApp()
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  const request = () => supertest(server.getServer().server)

  describe('GET /posts', () => {
    it('should return posts list (public endpoint)', async () => {
      const response = await request().get('/posts')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('posts')
      expect(Array.isArray(response.body.posts)).toBe(true)
    })

    it('should filter by authorId', async () => {
      // Create a post first
      await request()
        .post('/posts')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Test Post',
          content: 'This is test content for filtering',
          authorId: 'author-123',
        })

      const response = await request().get('/posts').query({ authorId: 'author-123' })

      expect(response.status).toBe(200)
      expect(response.body.posts.every((p: { authorId: string }) => p.authorId === 'author-123')).toBe(true)
    })

    it('should filter by published status', async () => {
      // Create published and unpublished posts
      await request()
        .post('/posts')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Published Post',
          content: 'This is a published post content',
          authorId: 'author-456',
          published: true,
        })

      const response = await request().get('/posts').query({ published: true })

      expect(response.status).toBe(200)
      expect(response.body.posts.every((p: { published: boolean }) => p.published === true)).toBe(true)
    })
  })

  describe('POST /posts', () => {
    it('should create a new post with validationId from request-scoped service', async () => {
      const response = await request()
        .post('/posts')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'My New Post',
          content: 'This is the content of my new post',
          authorId: 'author-789',
        })

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('id')
      expect(response.body.title).toBe('My New Post')
      expect(response.body.authorId).toBe('author-789')
      expect(response.body.published).toBe(false)
      expect(response.body).toHaveProperty('validationId')
    })

    it('should return 400 for title too short', async () => {
      const response = await request()
        .post('/posts')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'AB', // Too short
          content: 'This is valid content',
          authorId: 'author-789',
        })

      expect(response.status).toBe(400)
    })

    it('should return 400 for content too short', async () => {
      const response = await request()
        .post('/posts')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Valid Title',
          content: 'Short', // Too short
          authorId: 'author-789',
        })

      expect(response.status).toBe(400)
    })

    it('should reject without authorization', async () => {
      const response = await request().post('/posts').send({
        title: 'Unauthorized Post',
        content: 'This post should not be created',
        authorId: 'author-000',
      })

      expect(response.status).toBe(401)
    })
  })

  describe('Request-scoped service isolation', () => {
    it('should have unique validationId for each request', async () => {
      // Make sequential requests to avoid connection issues in test environment
      // while still demonstrating request-scoped isolation
      const responses = []
      for (let i = 0; i < 5; i++) {
        const response = await request()
          .post('/posts')
          .set('Authorization', 'Bearer valid-token')
          .send({
            title: `Post ${i}`,
            content: `Content for post number ${i} with enough chars`,
            authorId: `author-${i}`,
          })
        responses.push(response)
      }

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201)
        expect(response.body).toHaveProperty('validationId')
      })

      // Each should have unique validationId (proving request isolation)
      const validationIds = responses.map((r) => r.body.validationId)
      const uniqueIds = new Set(validationIds)
      expect(uniqueIds.size).toBe(validationIds.length)
    })
  })
})
