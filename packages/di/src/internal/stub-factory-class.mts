import { DIError } from '../errors/di-error.mjs'

/**
 * Stub factory class used when registering InjectionTokens without a real class implementation.
 * This is used in ScopedContainer.addInstance() to allow registering tokens that don't have
 * a corresponding class, while preventing accidental instantiation.
 *
 * @internal
 */
export class StubFactoryClass {
  constructor() {
    throw DIError.factoryNotFound('Trying to get instance of factory without real implementation')
  }
}
