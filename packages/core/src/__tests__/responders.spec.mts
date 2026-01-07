import { Container, inject, Injectable } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod/v4'

import type { ErrorResponder } from '../responders/interfaces/error-responder.interface.mjs'
import type { ErrorResponse } from '../responders/interfaces/error-response.interface.mjs'

import { NotFoundException } from '../exceptions/not-found.exception.mjs'
import { FrameworkError } from '../responders/enums/framework-error.enum.mjs'
import { ErrorResponseProducerService } from '../responders/services/error-response-producer.service.mjs'
// Import services for side-effects (registers @Injectable decorators)
import '../responders/services/forbidden-responder.service.mjs'
import '../responders/services/internal-server-error-responder.service.mjs'
import '../responders/services/not-found-responder.service.mjs'
import '../responders/services/validation-error-responder.service.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../responders/tokens/responder.tokens.mjs'

describe('Responders', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('InternalServerErrorResponderService', () => {
    it('should return 500 status code', async () => {
      const responder = await container.get(InternalServerErrorResponderToken)
      const error = new Error('Test error')

      const response = responder.getResponse(error)

      expect(response.statusCode).toBe(500)
      expect(response.payload.status).toBe(500)
      expect(response.payload.title).toBe('Internal Server Error')
      expect(response.payload.detail).toBe('Test error')
      expect(response.headers['Content-Type']).toBe('application/problem+json')
    })

    it('should use description when provided', async () => {
      const responder = await container.get(InternalServerErrorResponderToken)
      const error = new Error('Test error')

      const response = responder.getResponse(error, 'Custom description')

      expect(response.payload.detail).toBe('Custom description')
    })

    it('should handle non-Error objects', async () => {
      const responder = await container.get(InternalServerErrorResponderToken)

      const response = responder.getResponse('string error')

      expect(response.statusCode).toBe(500)
      expect(response.payload.detail).toBe('Internal Server Error')
    })
  })

  describe('NotFoundResponderService', () => {
    it('should return 404 status code', async () => {
      const responder = await container.get(NotFoundResponderToken)
      const error = new Error('Resource not found')

      const response = responder.getResponse(error)

      expect(response.statusCode).toBe(404)
      expect(response.payload.status).toBe(404)
      expect(response.payload.title).toBe('Not Found')
      expect(response.headers['Content-Type']).toBe('application/problem+json')
    })

    it('should use description when provided', async () => {
      const responder = await container.get(NotFoundResponderToken)
      const error = new Error('Test error')

      const response = responder.getResponse(error, 'User not found')

      expect(response.payload.detail).toBe('User not found')
    })

    it('should extract response from NotFoundException', async () => {
      const responder = await container.get(NotFoundResponderToken)
      const error = new NotFoundException('User with ID 123 not found')

      const response = responder.getResponse(error)

      expect(response.payload.detail).toBe('User with ID 123 not found')
    })

    it('should prioritize description over NotFoundException response', async () => {
      const responder = await container.get(NotFoundResponderToken)
      const error = new NotFoundException('User with ID 123 not found')

      const response = responder.getResponse(error, 'Custom message')

      expect(response.payload.detail).toBe('Custom message')
    })
  })

  describe('ForbiddenResponderService', () => {
    it('should return 403 status code', async () => {
      const responder = await container.get(ForbiddenResponderToken)
      const error = new Error('Access denied')

      const response = responder.getResponse(error)

      expect(response.statusCode).toBe(403)
      expect(response.payload.status).toBe(403)
      expect(response.payload.title).toBe('Forbidden')
      expect(response.headers['Content-Type']).toBe('application/problem+json')
    })

    it('should use description when provided', async () => {
      const responder = await container.get(ForbiddenResponderToken)
      const error = new Error('Test error')

      const response = responder.getResponse(
        error,
        'You do not have permission',
      )

      expect(response.payload.detail).toBe('You do not have permission')
    })
  })

  describe('ValidationErrorResponderService', () => {
    it('should return 400 status code for ZodError', async () => {
      const responder = await container.get(ValidationErrorResponderToken)
      const error = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          input: 'number',
          path: ['email'],
          message: 'Expected string, received number',
        },
      ])

      const response = responder.getResponse(error)

      expect(response.statusCode).toBe(400)
      expect(response.payload.status).toBe(400)
      expect(response.payload.title).toBe('Validation Error')
      expect(response.payload.detail).toBe('Request validation failed')
      expect(response.payload.errors).toBeDefined()
      expect(response.headers['Content-Type']).toBe('application/problem+json')
    })

    it('should use description when provided', async () => {
      const responder = await container.get(ValidationErrorResponderToken)
      const error = new ZodError([])

      const response = responder.getResponse(error, 'Email is invalid')

      expect(response.payload.detail).toBe('Email is invalid')
    })

    it('should handle non-ZodError gracefully', async () => {
      const responder = await container.get(ValidationErrorResponderToken)
      const error = new Error('Validation failed')

      const response = responder.getResponse(error)

      expect(response.statusCode).toBe(400)
      expect(response.payload.detail).toBe('Validation failed')
    })
  })

  describe('ErrorResponseProducerService', () => {
    it('should produce NotFound response', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        produce() {
          return this.producer.respond(
            FrameworkError.NotFound,
            new NotFoundException('User not found'),
          )
        }
      }

      const service = await container.get(TestService)
      const response = service.produce()

      expect(response.statusCode).toBe(404)
      expect(response.payload.title).toBe('Not Found')
      expect(response.payload.detail).toBe('User not found')
    })

    it('should produce Forbidden response', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        produce() {
          return this.producer.respond(FrameworkError.Forbidden, null)
        }
      }

      const service = await container.get(TestService)
      const response = service.produce()

      expect(response.statusCode).toBe(403)
      expect(response.payload.title).toBe('Forbidden')
    })

    it('should produce InternalServerError response', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        produce() {
          return this.producer.respond(
            FrameworkError.InternalServerError,
            new Error('Something went wrong'),
          )
        }
      }

      const service = await container.get(TestService)
      const response = service.produce()

      expect(response.statusCode).toBe(500)
      expect(response.payload.title).toBe('Internal Server Error')
      expect(response.payload.detail).toBe('Something went wrong')
    })

    it('should produce ValidationError response', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        produce() {
          return this.producer.respond(
            FrameworkError.ValidationError,
            new ZodError([]),
          )
        }
      }

      const service = await container.get(TestService)
      const response = service.produce()

      expect(response.statusCode).toBe(400)
      expect(response.payload.title).toBe('Validation Error')
    })

    it('should handle unknown errors with handleUnknown', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        produce() {
          return this.producer.handleUnknown(new Error('Unknown error'))
        }
      }

      const service = await container.get(TestService)
      const response = service.produce()

      expect(response.statusCode).toBe(500)
      expect(response.payload.title).toBe('Internal Server Error')
      expect(response.payload.detail).toBe('Unknown error')
    })

    it('should support convenience methods', async () => {
      @Injectable()
      class TestService {
        private producer = inject(ErrorResponseProducerService)

        testNotFound() {
          return this.producer.notFound(null, 'Resource not found')
        }

        testForbidden() {
          return this.producer.forbidden(null, 'Access denied')
        }

        testInternalServerError() {
          return this.producer.internalServerError(new Error('Server error'))
        }

        testValidationError() {
          return this.producer.validationError(new ZodError([]))
        }
      }

      const service = await container.get(TestService)

      expect(service.testNotFound().statusCode).toBe(404)
      expect(service.testForbidden().statusCode).toBe(403)
      expect(service.testInternalServerError().statusCode).toBe(500)
      expect(service.testValidationError().statusCode).toBe(400)
    })
  })

  describe('Custom responder override', () => {
    it('should allow overriding default responders with higher priority', async () => {
      @Injectable({
        token: NotFoundResponderToken,
        priority: 0, // Higher than default -10
      })
      class _CustomNotFoundResponder implements ErrorResponder {
        getResponse(_error: unknown, description?: string): ErrorResponse {
          return {
            statusCode: 404,
            payload: {
              type: 'https://api.example.com/errors/not-found',
              title: 'Custom Not Found',
              status: 404,
              detail: description ?? 'Custom not found message',
            },
            headers: {
              'Content-Type': 'application/problem+json',
            },
          }
        }
      }

      // Get the responder - should use custom implementation
      const responder = await container.get(NotFoundResponderToken)
      const response = responder.getResponse(null)

      expect(response.payload.title).toBe('Custom Not Found')
      expect(response.payload.type).toBe(
        'https://api.example.com/errors/not-found',
      )
    })
  })
})
