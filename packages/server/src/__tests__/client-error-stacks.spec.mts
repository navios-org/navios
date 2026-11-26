import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  BadRequestException,
  Controller,
  GuardDeniedError,
  handler,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Module,
  NaviosFactory,
  NotFoundException,
  ResponseValidationError,
  UseGuards,
  ValidationError,
} from '../index.mjs'
import { defineInMemoryEnvironment } from '../testing/index.mjs'

import type { NaviosApplication, NaviosApplicationOptions } from '../index.mjs'

function hasFrames(error: Error): boolean {
  return /^\s+at /m.test(error.stack ?? '')
}

describe('clientErrorStacks', () => {
  const apps: NaviosApplication<any>[] = []
  const defaultLimit = Error.stackTraceLimit

  @Module({})
  class EmptyModule {}

  async function start(
    clientErrorStacks?: NaviosApplicationOptions<any>['clientErrorStacks'],
    module: new () => object = EmptyModule,
  ) {
    const app = await NaviosFactory.create(module, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
      clientErrorStacks,
    })
    apps.push(app)
    await app.init()
    return app
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(async () => {
    for (const app of apps.splice(0)) {
      await app.close()
    }
    vi.unstubAllEnvs()
    expect(Error.stackTraceLimit).toBe(defaultLimit)
  })

  it('captures no stack for a 4xx HttpException with "never"', async () => {
    await start('never')
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('captures the stack of a 4xx HttpException with "always" in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await start('always')
    expect(hasFrames(new NotFoundException('gone'))).toBe(true)
  })

  it('captures stacks outside production by default', async () => {
    await start()
    expect(hasFrames(new NotFoundException('gone'))).toBe(true)
  })

  it('captures no stacks in production by default', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await start()
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('follows NODE_ENV as it is when the application initialises, not when core is imported', async () => {
    const app = await NaviosFactory.create(EmptyModule, {
      adapter: defineInMemoryEnvironment(),
      logger: false,
    })
    apps.push(app)
    vi.stubEnv('NODE_ENV', 'production')
    await app.init()
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('keeps the stack of a 5xx HttpException with "never"', async () => {
    await start('never')
    expect(hasFrames(new InternalServerErrorException('boom'))).toBe(true)
    expect(hasFrames(new HttpException(503, 'later'))).toBe(true)
  })

  it('covers application subclasses of HttpException', async () => {
    class TeapotException extends HttpException {
      constructor() {
        super(418, 'teapot')
      }
    }
    await start('never')
    const error = new TeapotException()
    expect(hasFrames(error)).toBe(false)
    expect(error.name).toBe('TeapotException')
    expect(error.message).toBe('teapot')
  })

  it('covers denied guards', async () => {
    await start('never')
    expect(hasFrames(new GuardDeniedError('AuthGuard'))).toBe(false)
    await start('always')
    expect(hasFrames(new GuardDeniedError('AuthGuard'))).toBe(true)
  })

  it('covers validation errors of the request', async () => {
    await start('never')
    expect(hasFrames(new ValidationError('body', [{ message: 'bad' }]))).toBe(false)
    await start('always')
    expect(hasFrames(new ValidationError('body', [{ message: 'bad' }]))).toBe(true)
  })

  it('keeps the stack of a response validation error with "never"', async () => {
    await start('never')
    expect(hasFrames(new ResponseValidationError([{ message: 'bad' }]))).toBe(true)
  })

  it('does not affect other errors', async () => {
    await start('never')
    expect(hasFrames(new Error('other'))).toBe(true)
    expect(hasFrames(new TypeError('other'))).toBe(true)
  })

  it('captures stacks while any running application wants them', async () => {
    await start('never')
    const wanting = await start('always')
    expect(hasFrames(new NotFoundException('gone'))).toBe(true)
    await wanting.close()
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('falls back to the environment when no application is running', async () => {
    const app = await start('never')
    await app.close()
    expect(hasFrames(new NotFoundException('gone'))).toBe(true)
    vi.stubEnv('NODE_ENV', 'production')
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('does not count an application whose init() failed', async () => {
    @Module({})
    class BrokenModule {
      onModuleInit() {
        throw new Error('broken')
      }
    }
    await expect(start('always', BrokenModule)).rejects.toThrow('broken')
    await start('never')
    expect(hasFrames(new NotFoundException('gone'))).toBe(false)
  })

  it('does not format the issues of a request without a stack until the message is read', async () => {
    await start('never')
    const read = vi.fn(() => 'bad')
    const issue = {
      get message() {
        return read()
      },
    }
    const error = new ValidationError('body', [issue])
    expect(read).not.toHaveBeenCalled()
    expect(error.message).toBe('Validation failed for body: bad')
    expect(read).toHaveBeenCalled()
  })

  it('has the message of a request validation error in its stack', async () => {
    await start('always')
    expect(new ValidationError('body', [{ message: 'bad' }]).stack).toContain(
      'Validation failed for body: bad',
    )
  })

  it('answers the same with and without stacks', async () => {
    @Injectable()
    class Deny {
      canActivate() {
        return false
      }
    }

    @Controller()
    class Routes {
      missing = handler({ config: { method: 'GET', url: '/missing' } } as any, () => {
        throw new NotFoundException('gone')
      })
      invalid = handler(
        {
          config: {
            method: 'POST',
            url: '/invalid',
            requestSchema: z.object({ name: z.string() }),
          },
        } as any,
        () => ({}),
      )
      teapot = handler({ config: { method: 'GET', url: '/bad' } } as any, () => {
        throw new BadRequestException({ code: 'E1' })
      })
    }

    @Controller()
    @UseGuards(Deny)
    class Guarded {
      denied = handler({ config: { method: 'GET', url: '/denied' } } as any, () => ({}))
    }

    @Module({ controllers: [Routes, Guarded] })
    class AppModule {}

    const answers = async (mode: 'always' | 'never') => {
      const app = await start(mode, AppModule)
      const result = []
      for (const request of [
        { method: 'GET', url: '/missing' },
        { method: 'POST', url: '/invalid', body: { name: 1 } },
        { method: 'GET', url: '/bad' },
        { method: 'GET', url: '/denied' },
      ]) {
        const { status, body } = await app.inject(request)
        result.push({ status, body })
      }
      await app.close()
      return result
    }

    const without = await answers('never')
    expect(without.map((answer) => answer.status)).toEqual([404, 400, 400, 403])
    expect(without).toEqual(await answers('always'))
  })
})

describe('ValidationError', () => {
  it('describes its issues', () => {
    const error = new ValidationError('body', [
      { message: 'is required', path: ['user', { key: 'name' }] },
      { message: 'is wrong' },
    ])
    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('Validation failed for body: user.name: is required; is wrong')
    expect(String(error)).toBe(`ValidationError: ${error.message}`)
    expect(error).toBeInstanceOf(Error)
  })

  it('has the message in its stack', () => {
    expect(new ResponseValidationError([{ message: 'bad' }]).stack).toContain(
      'Validation failed for response: bad',
    )
  })

  it('is not one for a response, which is a ResponseValidationError', () => {
    const error = new ResponseValidationError([{ message: 'bad' }])
    expect(error.name).toBe('ResponseValidationError')
    expect(String(error)).toBe('ResponseValidationError: Validation failed for response: bad')
    expect(error).not.toBeInstanceOf(ValidationError)
  })
})
