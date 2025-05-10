import { ErrorsEnum } from './errors.enum.mjs'

export class InstanceExpired extends Error {
  code = ErrorsEnum.InstanceExpired
  constructor(public name: string) {
    super(`Instance ${name} expired`)
  }
}
