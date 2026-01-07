import type { NaviosApplication } from '@navios/core'

import supertest from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../src/bootstrap.mjs'

describe('Files API', () => {
  let server: NaviosApplication

  beforeAll(async () => {
    server = await createApp()
    await server.init()
  })

  afterAll(async () => {
    await server.close()
  })

  const request = () => supertest(server.getServer().server)

  describe('POST /files/upload', () => {
    it('should upload single file', async () => {
      const response = await request()
        .post('/files/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('file content'), 'test.txt')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('id')
      expect(response.body.filename).toBe('test.txt')
      expect(response.body).toHaveProperty('size')
      expect(response.body).toHaveProperty('mimeType')
      expect(response.body).toHaveProperty('createdAt')
    })

    it('should reject upload without file', async () => {
      const response = await request()
        .post('/files/upload')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'multipart/form-data')
        .field('description', 'no file provided')

      expect(response.status).toBe(400)
    })

    it('should reject without authorization', async () => {
      const response = await request()
        .post('/files/upload')
        .attach('file', Buffer.from('file content'), 'test.txt')

      expect(response.status).toBe(401)
    })
  })

  describe('POST /files/upload-multiple', () => {
    it('should upload multiple files', async () => {
      const response = await request()
        .post('/files/upload-multiple')
        .set('Authorization', 'Bearer valid-token')
        .attach('files', Buffer.from('file 1 content'), 'file1.txt')
        .attach('files', Buffer.from('file 2 content'), 'file2.txt')
        .attach('files', Buffer.from('file 3 content'), 'file3.txt')

      expect(response.status).toBe(200)
      expect(response.body.uploaded).toHaveLength(3)
      expect(response.body.total).toBe(3)
      expect(response.body.uploaded[0]).toHaveProperty('id')
      expect(response.body.uploaded[0]).toHaveProperty('filename')
    })

    it('should reject without files', async () => {
      const response = await request()
        .post('/files/upload-multiple')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'multipart/form-data')
        .field('category', 'test')

      expect(response.status).toBe(400)
    })
  })

  describe('POST /users/:id/avatar', () => {
    it('should upload user avatar', async () => {
      // Create user first
      const createUserResponse = await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Avatar User', email: 'avatar@test.com' })

      const userId = createUserResponse.body.id

      const response = await request()
        .post(`/users/${userId}/avatar`)
        .set('Authorization', 'Bearer valid-token')
        .attach('avatar', Buffer.from('fake-image-data'), 'avatar.png')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('avatarUrl')
      expect(response.body.avatarUrl).toContain(userId)
    })

    it('should return 404 for non-existent user', async () => {
      const response = await request()
        .post('/users/non-existent/avatar')
        .set('Authorization', 'Bearer valid-token')
        .attach('avatar', Buffer.from('fake-image-data'), 'avatar.png')

      expect(response.status).toBe(404)
    })
  })

  describe('GET /files/:fileId/download (streaming)', () => {
    it('should download file as stream (public endpoint)', async () => {
      // Upload a file first
      const uploadResponse = await request()
        .post('/files/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('file', Buffer.from('test content for download'), 'download-test.txt')

      const fileId = uploadResponse.body.id

      const response = await request().get(`/files/${fileId}/download`)

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/plain')
      expect(response.headers['content-disposition']).toContain('download-test.txt')
      expect(response.text).toBe('test content for download')
    })

    it('should return 404 for non-existent file', async () => {
      const response = await request().get('/files/non-existent/download')

      expect(response.status).toBe(404)
    })
  })

  describe('GET /events/stream (SSE)', () => {
    it('should stream SSE events (public endpoint)', async () => {
      const response = await request().get('/events/stream').query({ topic: 'test-topic' })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/event-stream')

      // Parse SSE events
      const events = response.text.split('\n\n').filter(Boolean)
      expect(events.length).toBeGreaterThan(0)

      // Each event should have data: prefix
      events.forEach((event) => {
        expect(event).toMatch(/^data: /)
        const data = JSON.parse(event.replace('data: ', ''))
        expect(data).toHaveProperty('id')
        expect(data).toHaveProperty('topic', 'test-topic')
        expect(data).toHaveProperty('message')
        expect(data).toHaveProperty('timestamp')
      })
    })

    it('should use default topic when not specified', async () => {
      const response = await request().get('/events/stream')

      expect(response.status).toBe(200)

      const events = response.text.split('\n\n').filter(Boolean)
      const data = JSON.parse(events[0].replace('data: ', ''))
      expect(data.topic).toBe('default')
    })
  })

  describe('POST /export (data export stream)', () => {
    it('should export data as JSON (public endpoint)', async () => {
      // Create some users first
      await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Export User 1', email: 'export1@test.com' })

      await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Export User 2', email: 'export2@test.com' })

      const response = await request().post('/export').send({ format: 'json', type: 'users' })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.headers['content-disposition']).toContain('users.json')

      const data = JSON.parse(response.text)
      expect(Array.isArray(data)).toBe(true)
    })

    it('should export data as CSV', async () => {
      // Create a user first
      await request()
        .post('/users')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'CSV User', email: 'csv@test.com' })

      const response = await request().post('/export').send({ format: 'csv', type: 'users' })

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/csv')
      expect(response.headers['content-disposition']).toContain('users.csv')

      // CSV should have headers
      const lines = response.text.split('\n')
      expect(lines.length).toBeGreaterThan(0)
    })
  })
})
