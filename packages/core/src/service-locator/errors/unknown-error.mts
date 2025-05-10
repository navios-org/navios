import { ErrorsEnum } from './errors.enum.mjs'

export class UnknownError extends Error {
  code = ErrorsEnum.UnknownError
  parent?: Error

  constructor(message: string | Error) {
    if (message instanceof Error) {
      super(message.message)
      this.parent = message
      return
    }
    super(message)
  }
}
