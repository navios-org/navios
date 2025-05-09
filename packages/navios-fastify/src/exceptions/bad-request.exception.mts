import { HttpException } from './http.exception.mjs'

export class BadRequestException extends HttpException {
  constructor(message: string | object) {
    super(400, message)
  }
}
