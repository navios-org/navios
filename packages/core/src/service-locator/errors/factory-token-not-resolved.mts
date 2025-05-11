import type { ClassType } from '../injection-token.mjs'

import { ErrorsEnum } from './errors.enum.mjs'

export class FactoryTokenNotResolved extends Error {
  code = ErrorsEnum.FactoryTokenNotResolved
  constructor(name: string | symbol | ClassType) {
    super(`Factory token not resolved: ${name.toString()}`)
  }
}
