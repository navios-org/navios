import { HttpException } from './http.exception.mjs'

export class UnauthorizedException extends HttpException {
  constructor(message: string | object, error?: Error) {
    super(401, message, error)
  }
}
