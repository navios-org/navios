import { beforeEach, describe, expect, it } from 'vitest'

import { Injectable } from '../../decorators/injectable.decorator.mjs'
import { InjectionToken } from '../../injection-token.mjs'
import { inject } from '../../injector.mjs'
import { TestContainer } from '../test-container.mjs'

describe('TestContainer', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  describe('clear method', () => {
    it('should clear all instances from the container', () => {
      // This test verifies that the clear method exists and can be called
      expect(() => container.clear()).not.toThrow()
    })
  })

  describe('bind method', () => {
    it('should create a TestBindingBuilder', () => {
      const token = InjectionToken.create<string>('test-token')
      const builder = container.bind(token)
      expect(builder).toBeDefined()
      expect(builder).toHaveProperty('toValue')
      expect(builder).toHaveProperty('toClass')
    })

    it('should allow chaining bind operations', () => {
      const token = InjectionToken.create<string>('test-token')
      const result = container.bind(token).toValue('test-value')
      expect(result).toBe(container)
    })

    it('should bind value and retrieve it correctly', async () => {
      const token = InjectionToken.create<string>('test-token')
      const testValue = 'test-value'

      container.bind(token).toValue(testValue)

      const retrievedValue = await container.get(token)
      expect(retrievedValue).toBe(testValue)
    })

    it('should bind class and retrieve instance correctly', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test-service-value'
        }
      }

      const token = InjectionToken.create<TestService>('test-service')

      container.bind(token).toClass(TestService)

      const instance = await container.get(token)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getValue()).toBe('test-service-value')
    })
  })

  describe('bindValue method', () => {
    it('should bind a value to a token', () => {
      const token = InjectionToken.create<string>('test-token')
      const result = container.bindValue(token, 'test-value')
      expect(result).toBe(container)
    })

    it('should bind value and retrieve it correctly', async () => {
      const token = InjectionToken.create<number>('number-token')
      const testValue = 42

      container.bindValue(token, testValue)

      const retrievedValue = await container.get(token)
      expect(retrievedValue).toBe(testValue)
    })

    it('should bind object value and retrieve it correctly', async () => {
      interface TestConfig {
        apiUrl: string
        timeout: number
      }

      const token = InjectionToken.create<TestConfig>('config-token')
      const testConfig: TestConfig = {
        apiUrl: 'https://api.example.com',
        timeout: 5000,
      }

      container.bindValue(token, testConfig)

      const retrievedConfig = await container.get(token)
      expect(retrievedConfig).toEqual(testConfig)
      expect(retrievedConfig.apiUrl).toBe('https://api.example.com')
      expect(retrievedConfig.timeout).toBe(5000)
    })
  })

  describe('bindClass method', () => {
    it('should bind a class to a token', () => {
      class TestClass {}
      const token = InjectionToken.create<TestClass>('test-token')
      const result = container.bindClass(token, TestClass)
      expect(result).toBe(container)
    })

    it('should bind class and retrieve instance correctly', async () => {
      @Injectable()
      class UserService {
        private users: string[] = ['alice', 'bob']

        getUsers() {
          return this.users
        }

        addUser(user: string) {
          this.users.push(user)
        }
      }

      const token = InjectionToken.create<UserService>('user-service')

      container.bindClass(token, UserService)

      const instance = await container.get(token)
      expect(instance).toBeInstanceOf(UserService)
      expect(instance.getUsers()).toEqual(['alice', 'bob'])

      instance.addUser('charlie')
      expect(instance.getUsers()).toEqual(['alice', 'bob', 'charlie'])
    })

    it('should bind class with dependencies and retrieve instance correctly', async () => {
      @Injectable()
      class DatabaseService {
        connect() {
          return 'connected'
        }
      }

      @Injectable()
      class UserRepository {
        db = inject(DatabaseService)

        findUser(id: string) {
          return `User ${id} from ${this.db.connect()}`
        }
      }

      const dbToken = InjectionToken.create<DatabaseService>('db-service')
      const userRepoToken = InjectionToken.create<UserRepository>('user-repo')

      container.bindClass(dbToken, DatabaseService)
      container.bindClass(userRepoToken, UserRepository)

      const userRepo = await container.get(userRepoToken)
      expect(userRepo).toBeInstanceOf(UserRepository)
      expect(userRepo.findUser('123')).toBe('User 123 from connected')
    })
  })

  describe('createChild method', () => {
    it('should create a new TestContainer instance', () => {
      const child = container.createChild()
      expect(child).toBeInstanceOf(TestContainer)
      expect(child).not.toBe(container)
    })
  })
})
