import { resumeStacks, suspendStacks } from './client-error-stacks.mjs'

/**
 * An error that maps to an HTTP response.
 *
 * When the endpoint declares the status in `errorSchema`, an object `response`
 * is the body, as the declared schema parses it. Otherwise the response is
 * `application/problem+json`, with a string `response` as `detail` and an
 * object `response` merged in.
 *
 * The status is one of an error, 400 to 599. Pass another error as `cause`.
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
    assertErrorResponse(statusCode, response)
    const limit = statusCode < 500 ? suspendStacks() : undefined
    super(
      typeof response === 'string' ? response : `HTTP ${statusCode}`,
      cause === undefined ? undefined : { cause },
    )
    resumeStacks(limit)
    this.name = new.target.name
  }
}

function assertErrorResponse(statusCode: number, response: unknown): void {
  if (!(statusCode >= 400 && statusCode <= 599 && Number.isInteger(statusCode))) {
    throw new Error(
      `[Navios] HttpException cannot have the status ${statusCode}: it is not the status of an ` +
        `error (400 to 599). Return reply(status, body) for another.`,
    )
  }
  if (Array.isArray(response) || response instanceof Error) {
    throw new Error(
      `[Navios] The response of an HttpException is a text or an object of fields, not ` +
        `${Array.isArray(response) ? 'an array' : 'an error. Pass the error as the third argument, its cause'}.`,
    )
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
