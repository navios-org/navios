import { ErrorsEnum } from './errors.enum.mjs'

export class FactoryNotFound extends Error {
  code = ErrorsEnum.FactoryNotFound
  constructor(public name: string) {
    super(`Factory ${name} not found`)
  }
}
