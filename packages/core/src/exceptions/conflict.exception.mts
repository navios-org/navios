import { HttpException } from './http.exception.mjs'

export class ConflictException extends HttpException {
  constructor(message: string | object, error?: Error) {
    super(409, message, error)
  }
}
