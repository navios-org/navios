import { builder } from '@navios/builder'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { endpointConfig, memberEndpoint } from '../handlers/endpoint-declaration.mjs'
import { Controller, Endpoint, getControllerMetadata, Module, NaviosFactory } from '../index.mjs'
import { memberMetadata } from '../metadata/member-metadata.mjs'
import { createTestClient, defineInMemoryEnvironment } from '../testing/index.mjs'

const api = builder()

const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: z.object({ id: z.string() }),
})

const JobKey = Symbol.for('test.job')

/** What another transport's method decorator does. */
function Job(name: string) {
  return (_target: unknown, context: ClassMethodDecoratorContext) => {
    memberMetadata(context, context.name as string).entries.set(JobKey, name)
  }
}

describe('member metadata', () => {
  it('stores the endpoint as an entry of the member', () => {
    @Controller()
    class Users {
      @Endpoint(getUser)
      async show() {
        return { id: '1' }
      }
    }

    const member = getControllerMetadata(Users).members.get('show')!

    expect(memberEndpoint(member)).toBe(endpointConfig(getUser))
  })

  it('returns null for a member without an endpoint', () => {
    @Controller()
    class Jobs {
      @Job('nightly')
      async run() {}
    }

    const member = getControllerMetadata(Jobs).members.get('run')!

    expect(memberEndpoint(member)).toBeNull()
    expect(member.entries.get(JobKey)).toBe('nightly')
  })

  it('gives a subclass its own entries', () => {
    @Controller()
    class Parent {
      @Endpoint(getUser)
      async show() {
        return { id: '1' }
      }
    }

    @Controller()
    class Child extends Parent {
      @Job('child-only')
      override async show() {
        return { id: '2' }
      }
    }

    const parent = getControllerMetadata(Parent).members.get('show')!
    const child = getControllerMetadata(Child).members.get('show')!

    expect(memberEndpoint(child)).toBe(endpointConfig(getUser))
    expect(child.entries.get(JobKey)).toBe('child-only')
    expect(parent.entries.has(JobKey)).toBe(false)
  })

  it('serves a controller that also has another transport\'s handler', async () => {
    @Controller()
    class Users {
      @Endpoint(getUser)
      async show() {
        return { id: '1' }
      }

      @Job('nightly')
      async cleanup() {}
    }
    @Module({ controllers: [Users] })
    class Root {}

    const app = await NaviosFactory.create(Root, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    try {
      const response = await createTestClient(app)(getUser, { urlParams: { id: '1' } })
      expect(response.body).toEqual({ id: '1' })
      expect(app.routes()).toHaveLength(1)
    } finally {
      await app.close()
    }
  })
})
