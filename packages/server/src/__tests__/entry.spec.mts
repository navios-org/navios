import * as core from '@navios/core'
import { describe, expect, it } from 'vitest'

import * as adapter from '../adapter/index.mjs'
import { currentContext } from '../context/current-request-context.mjs'
import * as server from '../index.mjs'

const names = (entry: object) => Object.keys(entry).sort()

describe('the main entry', () => {
  it('exports everything of @navios/core', () => {
    expect(names(core).filter((name) => !(name in server))).toEqual([])
  })

  // What an application uses. A name that only adapters need belongs to
  // `@navios/server/adapter`, and one that only the package needs to neither.
  it('adds what an HTTP application uses', () => {
    expect(names(server).filter((name) => !(name in core))).toEqual([
      'BadRequestException',
      'ConflictException',
      'Controller',
      'Endpoint',
      'ForbiddenException',
      'ForbiddenResponder',
      'ForbiddenResponderToken',
      'GuardDeniedError',
      'HttpException',
      'InternalServerErrorException',
      'InternalServerErrorResponder',
      'InternalServerErrorResponderToken',
      'MethodNotAllowedException',
      'NaviosApplication',
      'NaviosFactory',
      'NotFoundException',
      'NotFoundResponder',
      'NotFoundResponderToken',
      'PayloadTooLargeException',
      'RequestContext',
      'RequestContextToken',
      'RequestValue',
      'ResponseValidationError',
      'ServiceUnavailableException',
      'TooManyRequestsException',
      'UnauthorizedException',
      'UnprocessableEntityException',
      'UnsupportedMediaTypeException',
      'ValidationError',
      'ValidationErrorResponder',
      'ValidationErrorResponderToken',
      'handler',
      'httpTransport',
      'isCustomResult',
      'isHttpContext',
      'problem',
      'registerController',
      'registerRequestValue',
      'reply',
      'result',
      'sse',
      'sseStream',
    ])
  })

  it('has an exception for each status the framework answers with itself', () => {
    const statuses = [
      server.MethodNotAllowedException,
      server.PayloadTooLargeException,
      server.UnsupportedMediaTypeException,
      server.ServiceUnavailableException,
    ].map((Exception) => {
      const error = new Exception()
      expect(error).toBeInstanceOf(server.HttpException)
      return [error.statusCode, error.message]
    })
    expect(statuses).toEqual([
      [405, 'Method Not Allowed'],
      [413, 'Payload Too Large'],
      [415, 'Unsupported Media Type'],
      [503, 'Service Unavailable'],
    ])
  })

  it('keeps the HTTP version of currentContext and the one Module', () => {
    expect(server.currentContext).toBe(currentContext)
    expect(server.currentContext).not.toBe(core.currentContext)
    expect(server.Module).toBe(core.Module)
  })
})

describe('the adapter entry', () => {
  it('exports what an adapter is written with', () => {
    expect(names(adapter)).toEqual([
      'ManagedBody',
      'RouteTable',
      'bodyTooLarge',
      'canonicalPath',
      'describesSuccess',
      'encodeResult',
      'incompleteBody',
      'isEventStream',
      'malformedMultipart',
      'malformedPath',
      'parseQuery',
      'readParts',
      'settledWithin',
      'toTestMessage',
      'toTestResponse',
    ])
  })
})
