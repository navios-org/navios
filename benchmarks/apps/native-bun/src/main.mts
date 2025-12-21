/**
 * Native Bun.serve benchmark application
 * No framework overhead - pure Bun HTTP server
 */
import {
  getHealthResponse,
  getJsonResponse,
  getUserById,
  createUser,
  getSearchResults,
  getPosts,
  getStats,
  getLargeData,
} from '../../../shared/data.js'
import { createUserSchema, searchQuerySchema } from '../../../shared/schemas.js'

const PORT = Number(process.env.PORT) || 3000

// Pre-serialize static responses for maximum performance
const healthJson = JSON.stringify(getHealthResponse())
const jsonJson = JSON.stringify(getJsonResponse())
const statsJson = JSON.stringify(getStats())
const largeDataJson = JSON.stringify(getLargeData())

// Response headers
const jsonHeaders = { 'Content-Type': 'application/json' }

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    // GET /health
    if (method === 'GET' && path === '/health') {
      return new Response(healthJson, { headers: jsonHeaders })
    }

    // GET /json
    if (method === 'GET' && path === '/json') {
      return new Response(jsonJson, { headers: jsonHeaders })
    }

    // GET /users/:id
    if (method === 'GET' && path.startsWith('/users/')) {
      const id = path.slice(7) // Remove '/users/'
      if (id && !id.includes('/')) {
        const user = getUserById(id)
        return new Response(JSON.stringify(user), { headers: jsonHeaders })
      }
    }

    // POST /users
    if (method === 'POST' && path === '/users') {
      return req.json().then((body) => {
        const parsed = createUserSchema.safeParse(body)
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: 'Invalid input' }), {
            status: 400,
            headers: jsonHeaders,
          })
        }
        const user = createUser(parsed.data)
        return new Response(JSON.stringify(user), {
          status: 201,
          headers: jsonHeaders,
        })
      })
    }

    // GET /search
    if (method === 'GET' && path === '/search') {
      const q = url.searchParams.get('q') || ''
      const page = Number(url.searchParams.get('page')) || 1
      const limit = Number(url.searchParams.get('limit')) || 10
      const result = getSearchResults(q, page, limit)
      return new Response(JSON.stringify(result), { headers: jsonHeaders })
    }

    // GET /posts
    if (method === 'GET' && path === '/posts') {
      const page = Number(url.searchParams.get('page')) || 1
      const pageSize = Number(url.searchParams.get('pageSize')) || 10
      const result = getPosts(page, pageSize)
      return new Response(JSON.stringify(result), { headers: jsonHeaders })
    }

    // GET /admin/stats
    if (method === 'GET' && path === '/admin/stats') {
      return new Response(statsJson, { headers: jsonHeaders })
    }

    // GET /data/large
    if (method === 'GET' && path === '/data/large') {
      return new Response(largeDataJson, { headers: jsonHeaders })
    }

    // 404 Not Found
    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: jsonHeaders,
    })
  },
})

console.log(`Native Bun server listening on http://localhost:${PORT}`)
