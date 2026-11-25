import { describe, expect, it } from 'vitest'

import { initializationError } from '../errors/create.mjs'
import { DIError, DIErrorCode } from '../index.mjs'

describe('DIError', () => {
  it('is an Error with a code', () => {
    const error = new DIError(DIErrorCode.ProviderNotFound, 'Test message')

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(DIErrorCode.ProviderNotFound)
    expect(error.message).toBe('Test message')
    expect(error.name).toBe('DIError')
    expect(error.context).toBeUndefined()
  })

  it('can carry a context and a cause', () => {
    const context = { key: 'value', num: 42 }
    const cause = new Error('original')
    const error = new DIError(DIErrorCode.UnknownError, 'Test message', context, { cause })

    expect(error.context).toEqual(context)
    expect(error.cause).toBe(cause)
  })

  it('has no static creators', () => {
    expect(Object.getOwnPropertyNames(DIError).sort()).toEqual(['length', 'name', 'prototype'])
  })

  it('wraps anything that is thrown', () => {
    const original = new Error('original')
    expect(initializationError('Service', original)).toMatchObject({
      code: DIErrorCode.InitializationError,
      message: 'Service Service initialization failed: original',
      cause: original,
    })
    expect(initializationError('Service', 'text').message).toBe(
      'Service Service initialization failed: text',
    )
  })

  it('has these codes', () => {
    expect(Object.values(DIErrorCode).sort()).toEqual([
      'AccessBeforeInit',
      'AsyncInitRequired',
      'CircularDependency',
      'ClassNotInjectable',
      'ContainerDisposed',
      'InitializationError',
      'OutsideInjectionContext',
      'ProviderConflict',
      'ProviderNotFound',
      'ScopeMismatchError',
      'TokenSchemaRequiredError',
      'TokenValidationError',
      'UnknownError',
    ])
  })
})
