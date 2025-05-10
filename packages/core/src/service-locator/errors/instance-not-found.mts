import { ErrorsEnum } from './errors.enum.mjs'

export class InstanceNotFound extends Error {
  code = ErrorsEnum.InstanceNotFound
  constructor(public name: string) {
    super(`Instance ${name} not found`)
  }
}
