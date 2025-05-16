import { describe, expect, it } from 'vitest'

import { InjectionToken } from '../injection-token.mjs'
import { ServiceLocator } from '../service-locator.mjs'

describe('ServiceLocator', () => {
  describe('getInstanceIdentifier', () => {
    it('should be possible to simple token', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(token)
      expect(identifier).toBe(`test(${token.id})`)
    })

    it('should be possible to bound token', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(
        InjectionToken.bound(token, {
          test: 'test',
        }),
      )
      expect(identifier).toBe(`test(${token.id}):test=test`)
    })

    it('should be possible to bound token with function', () => {
      const serviceLocator = new ServiceLocator()
      const token = InjectionToken.create('test')
      const identifier = serviceLocator.getInstanceIdentifier(
        InjectionToken.bound(token, { test: () => 'test' }),
      )
      expect(identifier).toBe(`test(${token.id}):test=fn_test(0)`)
    })
  })
})
