import { HttpException } from './http.exception.mjs'

export class InternalServerErrorException extends HttpException {
  constructor(message: string | object, error?: Error) {
    super(500, message, error)
  }
}
