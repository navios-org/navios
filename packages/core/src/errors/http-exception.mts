/**
 * An error that maps to an HTTP response.
 *
 * When the endpoint declares the status in `errorSchema`, `response` is sent
 * as the body. Otherwise the response is `application/problem+json`, with a
 * string `response` as `detail` and an object `response` merged in.
 */
export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly response: string | object,
    cause?: unknown,
  ) {
    super(
      typeof response === 'string' ? response : `HTTP ${statusCode}`,
      cause === undefined ? undefined : { cause },
    )
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

/**
 * Thrown by the pipeline when a guard returns `false`.
 * @internal
 */
export class GuardDeniedError extends Error {
  constructor(public readonly guard: string) {
    super(`Guard ${guard} denied the request`)
    this.name = 'GuardDeniedError'
  }
}

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

export function statusTitle(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? 'Server Error' : 'Error')
}
