import { HttpException } from './http.exception.mjs'

export class NotFoundException extends HttpException {
  constructor(
    public readonly response: string | object,
    public readonly error?: Error,
  ) {
    super(404, response, error)
  }
}
