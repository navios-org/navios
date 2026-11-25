import { resumeStacks, suspendStacks } from './client-error-stacks.mjs'

/**
 * An error that maps to an HTTP response.
 *
 * When the endpoint declares the status in `errorSchema`, `response` is sent
 * as the body. Otherwise the response is `application/problem+json`, with a
 * string `response` as `detail` and an object `response` merged in.
 *
 * Below 500 its stack is captured as the `clientErrorStacks` application
 * option says.
 */
export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly response: string | object,
    cause?: unknown,
  ) {
    const limit = statusCode < 500 ? suspendStacks() : undefined
    super(
      typeof response === 'string' ? response : `HTTP ${statusCode}`,
      cause === undefined ? undefined : { cause },
    )
    resumeStacks(limit)
    this.name = new.target.name
  }
}

export class BadRequestException extends HttpException {
  constructor(response: string | object = 'Bad Request', cause?: unknown) {
    super(400, response, cause)
  }
}

export class UnauthorizedException extends HttpException {
  constructor(response: string | object = 'Unauthorized', cause?: unknown) {
    super(401, response, cause)
  }
}

export class ForbiddenException extends HttpException {
  constructor(response: string | object = 'Forbidden', cause?: unknown) {
    super(403, response, cause)
  }
}

export class NotFoundException extends HttpException {
  constructor(response: string | object = 'Not Found', cause?: unknown) {
    super(404, response, cause)
  }
}

export class ConflictException extends HttpException {
  constructor(response: string | object = 'Conflict', cause?: unknown) {
    super(409, response, cause)
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(response: string | object = 'Unprocessable Entity', cause?: unknown) {
    super(422, response, cause)
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(response: string | object = 'Too Many Requests', cause?: unknown) {
    super(429, response, cause)
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(response: string | object = 'Internal Server Error', cause?: unknown) {
    super(500, response, cause)
  }
}
