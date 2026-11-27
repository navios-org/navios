import { handleLambdaEvent, invokeLambdaHandler } from 'srvx/aws-lambda'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NaviosApplication } from '@navios/server'
import type { AWSLambdaHandler } from 'srvx/aws-lambda'

import type { SrvxEnvironment } from '../src/index.mjs'

import { createApp } from './app.mjs'

// A function of AWS Lambda as the documentation of the adapter writes one.
// srvx makes a `Request` of the event of API Gateway, and a result of the
// `Response`.
describe('srvx adapter: a function of AWS Lambda', () => {
  let app: NaviosApplication<SrvxEnvironment>
  let handler: AWSLambdaHandler

  beforeAll(async () => {
    app = await createApp({ serve: { maxRequestBodySize: 1024 } })
    await app.init()
    const { fetch } = app.getServer()
    handler = (event, context) => handleLambdaEvent(fetch, event, context)
  })

  afterAll(async () => {
    await app.close()
  })

  const context = { awsRequestId: 'request-1' } as Parameters<AWSLambdaHandler>[1]

  it('answers an event of an HTTP API', async () => {
    const result = await handler(
      {
        version: '2.0',
        rawPath: '/users/7',
        rawQueryString: '',
        headers: { host: 'app.example' },
        isBase64Encoded: false,
        requestContext: { http: { method: 'GET', sourceIp: '203.0.113.9' } },
      },
      context,
    )
    expect(result).toMatchObject({ statusCode: 200 })
    const { body, headers } = result as { body: string; headers: Record<string, string> }
    expect(headers['content-type']).toContain('application/json')
    expect(JSON.parse(body)).toEqual({ id: '7', ip: '203.0.113.9' })
  })

  it('answers an event of a REST API, with a body', async () => {
    const result = await handler(
      {
        httpMethod: 'POST',
        path: '/echo',
        headers: { host: 'app.example', 'content-type': 'application/json' },
        body: Buffer.from('{"a":1}').toString('base64'),
        isBase64Encoded: true,
        requestContext: { identity: { sourceIp: '203.0.113.9' } },
      },
      context,
    )
    expect(result).toMatchObject({ statusCode: 200 })
    expect(JSON.parse((result as { body: string }).body)).toEqual({ data: { a: 1 } })
  })

  it('answers HEAD with the headers of GET, and without its body', async () => {
    const event = (method: string) => ({
      version: '2.0',
      rawPath: '/simple',
      rawQueryString: '',
      headers: { host: 'app.example' },
      isBase64Encoded: false,
      requestContext: { http: { method, sourceIp: '203.0.113.9' } },
    })
    type Result = { statusCode: number; body: string; headers: Record<string, string> }
    const get = (await handler(event('GET'), context)) as Result
    const head = (await handler(event('HEAD'), context)) as Result
    expect(get.body).toBe('{"ok":true}')
    expect(head.statusCode).toBe(200)
    expect(head.body).toBe('')
    expect(head.headers['content-type']).toBe(get.headers['content-type'])
    expect(head.headers['content-length']).toBe('11')
  })

  it('gives a handler the event, and answers like a server', async () => {
    const send = (path: string, init?: RequestInit) =>
      invokeLambdaHandler(handler, new Request(`https://app.example${path}`, init))
    expect(await (await send('/runtime')).json()).toMatchObject({
      name: 'aws-lambda',
      hasNode: false,
    })
    const missing = await send('/nowhere')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('application/problem+json')
    const large = await send('/length', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(1025),
    })
    expect(large.status).toBe(413)
    expect(await (await send('/events')).text()).toBe(':\n\ndata: one\n\ndata: two\n\n')
  })
})
