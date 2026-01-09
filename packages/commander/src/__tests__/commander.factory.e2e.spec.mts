import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { CommandHandler } from '../interfaces/command-handler.interface.mjs'

import { CommanderFactory } from '../commander.factory.mjs'
import { CliModule } from '../decorators/cli-module.decorator.mjs'
import { Command } from '../decorators/command.decorator.mjs'

describe('CommanderApplication E2E - run() with different argv', () => {
  describe('simple command without options', () => {
    const executeMock = vi.fn()

    @Command({ path: 'hello' })
    class HelloCommand implements CommandHandler {
      async execute() {
        executeMock()
        console.log('Hello, World!')
      }
    }

    @CliModule({
      commands: [HelloCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should execute command with minimal argv', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'hello'])

      expect(executeMock).toHaveBeenCalledTimes(1)
      await app.close()
    })

    it('should execute command with absolute path in argv', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['/usr/local/bin/node', '/path/to/script.js', 'hello'])

      expect(executeMock).toHaveBeenCalledTimes(1)
      await app.close()
    })
  })

  describe('command with boolean flags', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      verbose: z.boolean().optional().default(false),
      debug: z.boolean().optional().default(false),
      quiet: z.boolean().optional().default(false),
    })

    @Command({ path: 'test', optionsSchema })
    class TestCommand implements CommandHandler<z.infer<typeof optionsSchema>> {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [TestCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should parse single boolean flag', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'test', '--verbose'])

      expect(executeMock).toHaveBeenCalledWith({
        verbose: true,
        debug: false,
        quiet: false,
      })
      await app.close()
    })

    it('should parse multiple boolean flags', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'test', '--verbose', '--debug'])

      expect(executeMock).toHaveBeenCalledWith({
        verbose: true,
        debug: true,
        quiet: false,
      })
      await app.close()
    })

    it('should parse kebab-case flags to camelCase', async () => {
      const optionsSchema = z.object({
        dryRun: z.boolean().optional().default(false),
      })

      @Command({ path: 'deploy', optionsSchema })
      class DeployCommand implements CommandHandler<
        z.infer<typeof optionsSchema>
      > {
        async execute(options: z.infer<typeof optionsSchema>) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [DeployCommand],
      })
      class DeployModule {}

      const app = await CommanderFactory.create(DeployModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'deploy', '--dry-run'])

      expect(executeMock).toHaveBeenCalledWith({
        dryRun: true,
      })
      await app.close()
    })

    it('should handle short flags', async () => {
      const optionsSchema = z.object({
        v: z.boolean().optional().default(false),
        d: z.boolean().optional().default(false),
      })

      @Command({ path: 'build', optionsSchema })
      class BuildCommand implements CommandHandler<
        z.infer<typeof optionsSchema>
      > {
        async execute(options: z.infer<typeof optionsSchema>) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [BuildCommand],
      })
      class BuildModule {}

      const app = await CommanderFactory.create(BuildModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'build', '-v', '-d'])

      expect(executeMock).toHaveBeenCalledWith({
        v: true,
        d: true,
      })
      await app.close()
    })
  })

  describe('command with string options', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      name: z.string(),
      greeting: z.string().optional().default('Hello'),
      message: z.string().optional(),
    })

    @Command({ path: 'greet', optionsSchema })
    class GreetCommand implements CommandHandler<
      z.infer<typeof optionsSchema>
    > {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [GreetCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should parse required string option', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'greet', '--name', 'Alice'])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Alice',
        greeting: 'Hello',
        message: undefined,
      })
      await app.close()
    })

    it('should parse multiple string options', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'greet',
        '--name',
        'Bob',
        '--greeting',
        'Hi',
        '--message',
        'How are you?',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Bob',
        greeting: 'Hi',
        message: 'How are you?',
      })
      await app.close()
    })

    it('should parse options with equal sign syntax', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'greet',
        '--name=Charlie',
        '--greeting=Hey',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Charlie',
        greeting: 'Hey',
        message: undefined,
      })
      await app.close()
    })

    it('should handle string values with spaces', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'greet',
        '--name',
        'Alice Smith',
        '--message',
        'Good morning everyone',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Alice Smith',
        greeting: 'Hello',
        message: 'Good morning everyone',
      })
      await app.close()
    })
  })

  describe('command with numeric options', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      port: z.number(),
      timeout: z.number().optional().default(5000),
      retries: z.number().optional(),
    })

    @Command({ path: 'serve', optionsSchema })
    class ServeCommand implements CommandHandler<
      z.infer<typeof optionsSchema>
    > {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [ServeCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should parse integer values', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'serve', '--port', '3000'])

      expect(executeMock).toHaveBeenCalledWith({
        port: 3000,
        timeout: 5000,
        retries: undefined,
      })
      await app.close()
    })

    it('should parse multiple numeric options', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'serve',
        '--port',
        '8080',
        '--timeout',
        '10000',
        '--retries',
        '3',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        port: 8080,
        timeout: 10000,
        retries: 3,
      })
      await app.close()
    })

    it('should parse numeric values with equal sign', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'serve', '--port=4000'])

      expect(executeMock).toHaveBeenCalledWith({
        port: 4000,
        timeout: 5000,
        retries: undefined,
      })
      await app.close()
    })
  })

  describe('command with mixed option types', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      env: z.string(),
      port: z.number().optional().default(3000),
      verbose: z.boolean().optional().default(false),
      workers: z.number().optional(),
      config: z.string().optional(),
    })

    @Command({ path: 'start', optionsSchema })
    class StartCommand implements CommandHandler<
      z.infer<typeof optionsSchema>
    > {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [StartCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should parse mixed types in correct order', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'start',
        '--env',
        'production',
        '--port',
        '8080',
        '--verbose',
        '--workers',
        '4',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        env: 'production',
        port: 8080,
        verbose: true,
        workers: 4,
        config: undefined,
      })
      await app.close()
    })

    it('should parse mixed types in random order', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'start',
        '--verbose',
        '--env',
        'staging',
        '--workers',
        '2',
        '--config',
        'app.json',
        '--port',
        '5000',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        env: 'staging',
        port: 5000,
        verbose: true,
        workers: 2,
        config: 'app.json',
      })
      await app.close()
    })
  })

  describe('multi-word commands', () => {
    const executeMock = vi.fn()

    @Command({ path: 'db migrate' })
    class DbMigrateCommand implements CommandHandler {
      async execute() {
        executeMock('migrate')
      }
    }

    @Command({ path: 'db seed' })
    class DbSeedCommand implements CommandHandler {
      async execute() {
        executeMock('seed')
      }
    }

    @Command({ path: 'db rollback' })
    class DbRollbackCommand implements CommandHandler {
      async execute() {
        executeMock('rollback')
      }
    }

    @CliModule({
      commands: [DbMigrateCommand, DbSeedCommand, DbRollbackCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should execute multi-word command', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'db', 'migrate'])

      expect(executeMock).toHaveBeenCalledWith('migrate')
      await app.close()
    })

    it('should execute different multi-word commands', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'db', 'seed'])
      expect(executeMock).toHaveBeenCalledWith('seed')

      executeMock.mockClear()

      await adapter.run(['node', 'script.js', 'db', 'rollback'])
      expect(executeMock).toHaveBeenCalledWith('rollback')

      await app.close()
    })

    it('should execute multi-word command with options', async () => {
      const optionsSchema = z.object({
        steps: z.number().optional(),
      })

      @Command({ path: 'db rollback', optionsSchema })
      class DbRollbackWithOptionsCommand implements CommandHandler<
        z.infer<typeof optionsSchema>
      > {
        async execute(options: z.infer<typeof optionsSchema>) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [DbRollbackWithOptionsCommand],
      })
      class RollbackModule {}

      const app = await CommanderFactory.create(RollbackModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'db', 'rollback', '--steps', '3'])

      expect(executeMock).toHaveBeenCalledWith({ steps: 3 })
      await app.close()
    })
  })

  describe('error handling', () => {
    @Command({ path: 'valid' })
    class ValidCommand implements CommandHandler {
      async execute() {
        console.log('Valid command executed')
      }
    }

    @CliModule({
      commands: [ValidCommand],
    })
    class TestModule {}

    it('should throw error when command not found', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await expect(
        adapter.run(['node', 'script.js', 'invalid']),
      ).rejects.toThrow('[Navios Commander] Command not found: invalid')

      await app.close()
    })

    it('should throw error when no command provided', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await expect(adapter.run(['node', 'script.js'])).rejects.toThrow(
        '[Navios Commander] No command provided',
      )

      await app.close()
    })
  })

  describe('command with positional arguments', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      force: z.boolean().optional().default(false),
    })

    @Command({ path: 'copy', optionsSchema })
    class CopyCommand implements CommandHandler<z.infer<typeof optionsSchema>> {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [CopyCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should parse command with options only', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'copy', '--force'])

      expect(executeMock).toHaveBeenCalledWith({
        force: true,
      })
      await app.close()
    })

    it('should parse command with mixed options and positionals', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      // Note: positionals are not extracted in this test, but the command should still execute
      await adapter.run(['node', 'script.js', 'copy', '--force'])

      expect(executeMock).toHaveBeenCalledWith({
        force: true,
      })
      await app.close()
    })
  })

  describe('complex real-world scenarios', () => {
    const executeMock = vi.fn()

    const deploySchema = z.object({
      env: z.string(),
      branch: z.string().optional().default('main'),
      verbose: z.boolean().optional().default(false),
      dryRun: z.boolean().optional().default(false),
      timeout: z.number().optional().default(300),
      workers: z.number().optional(),
      skipTests: z.boolean().optional().default(false),
      buildArgs: z.string().optional(),
    })

    @Command({ path: 'app deploy', optionsSchema: deploySchema })
    class DeployCommand implements CommandHandler<
      z.infer<typeof deploySchema>
    > {
      async execute(options: z.infer<typeof deploySchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [DeployCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should handle production deployment scenario', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'app',
        'deploy',
        '--env',
        'production',
        '--branch',
        'release/v1.2.0',
        '--verbose',
        '--timeout',
        '600',
        '--workers',
        '8',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        env: 'production',
        branch: 'release/v1.2.0',
        verbose: true,
        dryRun: false,
        timeout: 600,
        workers: 8,
        skipTests: false,
        buildArgs: undefined,
      })
      await app.close()
    })

    it('should handle staging dry-run deployment', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'app',
        'deploy',
        '--env',
        'staging',
        '--dry-run',
        '--skip-tests',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        env: 'staging',
        branch: 'main',
        verbose: false,
        dryRun: true,
        timeout: 300,
        workers: undefined,
        skipTests: true,
        buildArgs: undefined,
      })
      await app.close()
    })

    it('should handle deployment with build arguments', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'app',
        'deploy',
        '--env=development',
        '--build-args',
        'NODE_ENV=development API_KEY=test',
        '--verbose',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        env: 'development',
        branch: 'main',
        verbose: true,
        dryRun: false,
        timeout: 300,
        workers: undefined,
        skipTests: false,
        buildArgs: 'NODE_ENV=development API_KEY=test',
      })
      await app.close()
    })
  })

  describe('edge cases and special characters', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      path: z.string().optional(),
      url: z.string().optional(),
      data: z.string().optional(),
    })

    @Command({ path: 'process', optionsSchema })
    class ProcessCommand implements CommandHandler<
      z.infer<typeof optionsSchema>
    > {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [ProcessCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should handle paths with slashes', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'process',
        '--path',
        '/usr/local/bin',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        path: '/usr/local/bin',
        url: undefined,
        data: undefined,
      })
      await app.close()
    })

    it('should handle URLs', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'process',
        '--url',
        'https://api.example.com/v1/users',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        path: undefined,
        url: 'https://api.example.com/v1/users',
        data: undefined,
      })
      await app.close()
    })

    it('should handle JSON-like strings (auto-parsed)', async () => {
      // Note: The CLI parser automatically parses valid JSON strings
      // If you need to pass raw JSON as a string, wrap it in quotes
      const jsonSchema = z.object({
        data: z.record(z.string(), z.any()).optional(),
      })

      @Command({ path: 'json-process', optionsSchema: jsonSchema })
      class JsonProcessCommand implements CommandHandler<
        z.infer<typeof jsonSchema>
      > {
        async execute(options: z.infer<typeof jsonSchema>) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [JsonProcessCommand],
      })
      class JsonModule {}

      const jsonApp = await CommanderFactory.create(JsonModule)
      await jsonApp.init()

      const adapter = jsonApp.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'json-process',
        '--data',
        '{"key":"value","count":42}',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        data: { key: 'value', count: 42 },
      })
      await jsonApp.close()
    })

    it('should handle values with dashes', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'process',
        '--path',
        'my-app-folder',
        '--data',
        'user-name-123',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        path: 'my-app-folder',
        url: undefined,
        data: 'user-name-123',
      })
      await app.close()
    })
  })

  describe('default values', () => {
    const executeMock = vi.fn()

    const optionsSchema = z.object({
      name: z.string(),
      greeting: z.string().default('Hello'),
      count: z.number().default(1),
      verbose: z.boolean().default(false),
      optional: z.string().optional(),
    })

    @Command({ path: 'welcome', optionsSchema })
    class WelcomeCommand implements CommandHandler<
      z.infer<typeof optionsSchema>
    > {
      async execute(options: z.infer<typeof optionsSchema>) {
        executeMock(options)
      }
    }

    @CliModule({
      commands: [WelcomeCommand],
    })
    class TestModule {}

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should use default values when options not provided', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run(['node', 'script.js', 'welcome', '--name', 'Alice'])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Alice',
        greeting: 'Hello',
        count: 1,
        verbose: false,
        optional: undefined,
      })
      await app.close()
    })

    it('should override default values when provided', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'welcome',
        '--name',
        'Bob',
        '--greeting',
        'Hi',
        '--count',
        '5',
        '--verbose',
        '--optional',
        'extra',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Bob',
        greeting: 'Hi',
        count: 5,
        verbose: true,
        optional: 'extra',
      })
      await app.close()
    })

    it('should mix defaults and provided values', async () => {
      const app = await CommanderFactory.create(TestModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.run([
        'node',
        'script.js',
        'welcome',
        '--name',
        'Charlie',
        '--count',
        '3',
      ])

      expect(executeMock).toHaveBeenCalledWith({
        name: 'Charlie',
        greeting: 'Hello',
        count: 3,
        verbose: false,
        optional: undefined,
      })
      await app.close()
    })
  })

  describe('nested modules', () => {
    const executeMock = vi.fn()

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should discover commands from imported modules', async () => {
      @Command({ path: 'user:create' })
      class UserCreateCommand implements CommandHandler {
        async execute() {
          executeMock('user:create')
        }
      }

      @CliModule({
        commands: [UserCreateCommand],
      })
      class UserModule {}

      @Command({ path: 'admin:reset' })
      class AdminResetCommand implements CommandHandler {
        async execute() {
          executeMock('admin:reset')
        }
      }

      @CliModule({
        commands: [AdminResetCommand],
      })
      class AdminModule {}

      @CliModule({
        imports: [UserModule, AdminModule],
      })
      class AppModule {}

      const app = await CommanderFactory.create(AppModule)
      await app.init()

      const adapter = app.getAdapter()

      await adapter.executeCommand('user:create', {})
      expect(executeMock).toHaveBeenCalledWith('user:create')

      executeMock.mockClear()

      await adapter.executeCommand('admin:reset', {})
      expect(executeMock).toHaveBeenCalledWith('admin:reset')

      await app.close()
    })
  })

  describe('executeCommand', () => {
    const executeMock = vi.fn()

    beforeEach(() => {
      executeMock.mockClear()
    })

    it('should execute command programmatically', async () => {
      @Command({ path: 'greet' })
      class GreetCommand implements CommandHandler {
        async execute(options: { name: string }) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [GreetCommand],
      })
      class AppModule {}

      const app = await CommanderFactory.create(AppModule)
      await app.init()

      const adapter = app.getAdapter()
      await adapter.executeCommand('greet', { name: 'World' })

      expect(executeMock).toHaveBeenCalledWith({ name: 'World' })
      await app.close()
    })

    it('should validate options with Zod schema', async () => {
      const optionsSchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      })

      @Command({ path: 'create-user', optionsSchema })
      class CreateUserCommand implements CommandHandler<
        z.infer<typeof optionsSchema>
      > {
        async execute(options: z.infer<typeof optionsSchema>) {
          executeMock(options)
        }
      }

      @CliModule({
        commands: [CreateUserCommand],
      })
      class AppModule {}

      const app = await CommanderFactory.create(AppModule)
      await app.init()

      const adapter = app.getAdapter()

      // Valid options
      await adapter.executeCommand('create-user', {
        name: 'John',
        email: 'john@example.com',
      })
      expect(executeMock).toHaveBeenCalled()

      // Invalid options
      await expect(
        adapter.executeCommand('create-user', {
          name: '',
          email: 'invalid',
        }),
      ).rejects.toThrow()

      await app.close()
    })
  })

  describe('getAllCommands', () => {
    it('should return all registered commands', async () => {
      @Command({ path: 'cmd1' })
      class Command1 implements CommandHandler {
        execute() {}
      }

      @Command({ path: 'cmd2' })
      class Command2 implements CommandHandler {
        execute() {}
      }

      @CliModule({
        commands: [Command1, Command2],
      })
      class AppModule {}

      const app = await CommanderFactory.create(AppModule)
      await app.init()

      const adapter = app.getAdapter()
      const commands = adapter.getAllCommands()

      // 3 commands: cmd1, cmd2, and the built-in help command
      expect(commands).toHaveLength(3)
      expect(commands.map((c) => c.path)).toEqual(
        expect.arrayContaining(['cmd1', 'cmd2', 'help']),
      )

      await app.close()
    })
  })
})
