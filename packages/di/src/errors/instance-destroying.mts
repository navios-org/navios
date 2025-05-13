import { ErrorsEnum } from './errors.enum.mjs'

export class InstanceDestroying extends Error {
  code = ErrorsEnum.InstanceDestroying
  constructor(public name: string) {
    super(`Instance ${name} destroying`)
  }
}
