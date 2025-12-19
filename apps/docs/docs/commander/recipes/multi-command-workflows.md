---
sidebar_position: 4
---

# Multi-Command Workflows

This recipe shows how to create workflows that execute multiple commands in sequence, handle dependencies, and manage complex operations.

## Sequential Command Execution

Create a service that executes multiple commands:

```typescript
import { inject, Injectable } from '@navios/di'
import { CommanderApplication } from '@navios/commander'

@Injectable()
class WorkflowService {
  private app = inject(CommanderApplication)

  async executeWorkflow(commands: Array<{ path: string; options?: any }>) {
    const results = []
    
    for (const command of commands) {
      console.log(`Executing: ${command.path}`)
      try {
        await this.app.executeCommand(command.path, command.options || {})
        results.push({ path: command.path, success: true })
      } catch (error) {
        results.push({ path: command.path, success: false, error: error.message })
        throw error // Stop on first error
      }
    }
    
    return results
  }
}
```

## Deployment Workflow

Create a deployment workflow command:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { z } from 'zod'

const deploySchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  skipTests: z.boolean().default(false),
  skipMigrations: z.boolean().default(false),
})

@Command({
  path: 'deploy',
  optionsSchema: deploySchema,
})
export class DeployCommand implements CommandHandler<
  z.infer<typeof deploySchema>
> {
  private workflowService = inject(WorkflowService)

  async execute(options) {
    const commands = []

    // Run tests unless skipped
    if (!options.skipTests) {
      commands.push({ path: 'test:run' })
    }

    // Build application
    commands.push({ path: 'build' })

    // Run migrations unless skipped
    if (!options.skipMigrations) {
      commands.push({ path: 'db:migrate', options: { environment: options.environment } })
    }

    // Deploy to environment
    commands.push({ path: 'deploy:push', options: { environment: options.environment } })

    // Run post-deployment tasks
    commands.push({ path: 'deploy:verify', options: { environment: options.environment } })

    await this.workflowService.executeWorkflow(commands)
    console.log(`Deployment to ${options.environment} completed successfully`)
  }
}
```

## Database Setup Workflow

Create a database setup workflow:

```typescript
const setupSchema = z.object({
  reset: z.boolean().default(false),
  seed: z.boolean().default(true),
})

@Command({
  path: 'db:setup',
  optionsSchema: setupSchema,
})
export class DatabaseSetupCommand implements CommandHandler<
  z.infer<typeof setupSchema>
> {
  private workflowService = inject(WorkflowService)

  async execute(options) {
    const commands = []

    if (options.reset) {
      commands.push({ path: 'db:reset' })
    }

    commands.push({ path: 'db:migrate' })

    if (options.seed) {
      commands.push({ path: 'db:seed' })
    }

    await this.workflowService.executeWorkflow(commands)
    console.log('Database setup completed')
  }
}
```

## Conditional Workflows

Create workflows with conditional logic:

```typescript
@Injectable()
class ConditionalWorkflowService {
  private app = inject(CommanderApplication)

  async executeConditional(
    condition: (context: any) => boolean,
    ifTrue: Array<{ path: string; options?: any }>,
    ifFalse: Array<{ path: string; options?: any }>
  ) {
    const context = await this.getContext()
    
    if (condition(context)) {
      return this.executeCommands(ifTrue)
    } else {
      return this.executeCommands(ifFalse)
    }
  }

  private async getContext() {
    // Get current context
    return {}
  }

  private async executeCommands(commands: Array<{ path: string; options?: any }>) {
    for (const command of commands) {
      await this.app.executeCommand(command.path, command.options || {})
    }
  }
}

const conditionalSchema = z.object({
  environment: z.enum(['development', 'production']),
})

@Command({
  path: 'deploy:conditional',
  optionsSchema: conditionalSchema,
})
export class ConditionalDeployCommand implements CommandHandler<
  z.infer<typeof conditionalSchema>
> {
  private workflowService = inject(ConditionalWorkflowService)

  async execute(options) {
    if (options.environment === 'production') {
      // Production workflow
      await this.workflowService.executeConditional(
        () => true,
        [
          { path: 'test:run' },
          { path: 'build' },
          { path: 'db:migrate' },
          { path: 'deploy:push', options: { environment: 'production' } },
        ],
        []
      )
    } else {
      // Development workflow
      await this.workflowService.executeConditional(
        () => true,
        [
          { path: 'build' },
          { path: 'deploy:push', options: { environment: 'development' } },
        ],
        []
      )
    }
  }
}
```

## Parallel Command Execution

Create a service for parallel command execution:

```typescript
@Injectable()
class ParallelWorkflowService {
  private app = inject(CommanderApplication)

  async executeParallel(commands: Array<{ path: string; options?: any }>) {
    const promises = commands.map(command =>
      this.app.executeCommand(command.path, command.options || {})
        .then(() => ({ path: command.path, success: true }))
        .catch(error => ({ path: command.path, success: false, error: error.message }))
    )

    const results = await Promise.all(promises)
    return results
  }
}

const parallelSchema = z.object({
  tasks: z.array(z.string()),
})

@Command({
  path: 'run:parallel',
  optionsSchema: parallelSchema,
})
export class ParallelRunCommand implements CommandHandler<
  z.infer<typeof parallelSchema>
> {
  private workflowService = inject(ParallelWorkflowService)

  async execute(options) {
    const commands = options.tasks.map(task => ({ path: task }))
    const results = await this.workflowService.executeParallel(commands)
    
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    
    console.log(`Completed: ${successful.length} successful, ${failed.length} failed`)
    
    if (failed.length > 0) {
      console.error('Failed commands:')
      failed.forEach(result => {
        console.error(`  - ${result.path}: ${result.error}`)
      })
      process.exit(1)
    }
  }
}
```

## Workflow with Rollback

Create workflows with rollback capability:

```typescript
@Injectable()
class RollbackWorkflowService {
  private app = inject(CommanderApplication)
  private executedCommands: Array<{ path: string; options?: any; rollback?: string }> = []

  async executeWithRollback(commands: Array<{ path: string; options?: any; rollback?: string }>) {
    this.executedCommands = []

    try {
      for (const command of commands) {
        await this.app.executeCommand(command.path, command.options || {})
        this.executedCommands.push(command)
      }
    } catch (error) {
      console.error('Error during workflow execution, rolling back...')
      await this.rollback()
      throw error
    }
  }

  private async rollback() {
    // Rollback in reverse order
    for (let i = this.executedCommands.length - 1; i >= 0; i--) {
      const command = this.executedCommands[i]
      if (command.rollback) {
        try {
          await this.app.executeCommand(command.rollback, command.options || {})
          console.log(`Rolled back: ${command.path}`)
        } catch (error) {
          console.error(`Failed to rollback ${command.path}:`, error.message)
        }
      }
    }
  }
}

const rollbackSchema = z.object({
  environment: z.enum(['staging', 'production']),
})

@Command({
  path: 'deploy:with-rollback',
  optionsSchema: rollbackSchema,
})
export class DeployWithRollbackCommand implements CommandHandler<
  z.infer<typeof rollbackSchema>
> {
  private workflowService = inject(RollbackWorkflowService)

  async execute(options) {
    const commands = [
      {
        path: 'db:migrate',
        options: { environment: options.environment },
        rollback: 'db:rollback',
      },
      {
        path: 'deploy:push',
        options: { environment: options.environment },
        rollback: 'deploy:revert',
      },
    ]

    await this.workflowService.executeWithRollback(commands)
    console.log(`Deployment to ${options.environment} completed`)
  }
}
```

## Workflow Configuration

Use configuration for workflow definitions:

```typescript
@Injectable()
class ConfigurableWorkflowService {
  private app = inject(CommanderApplication)

  async executeFromConfig(workflowName: string, options: any) {
    const workflow = this.getWorkflowConfig(workflowName)
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`)
    }

    for (const step of workflow.steps) {
      const stepOptions = this.resolveOptions(step.options, options)
      await this.app.executeCommand(step.command, stepOptions)
    }
  }

  private getWorkflowConfig(name: string) {
    const workflows: Record<string, any> = {
      deploy: {
        steps: [
          { command: 'test:run' },
          { command: 'build' },
          { command: 'db:migrate', options: { environment: '{{environment}}' } },
          { command: 'deploy:push', options: { environment: '{{environment}}' } },
        ],
      },
      setup: {
        steps: [
          { command: 'db:migrate' },
          { command: 'db:seed' },
        ],
      },
    }

    return workflows[name]
  }

  private resolveOptions(template: any, context: any) {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || '')
    }
    if (typeof template === 'object') {
      const resolved: any = {}
      for (const [key, value] of Object.entries(template)) {
        resolved[key] = this.resolveOptions(value, context)
      }
      return resolved
    }
    return template
  }
}

const configSchema = z.object({
  workflow: z.string(),
  environment: z.string().optional(),
})

@Command({
  path: 'workflow:run',
  optionsSchema: configSchema,
})
export class RunWorkflowCommand implements CommandHandler<
  z.infer<typeof configSchema>
> {
  private workflowService = inject(ConfigurableWorkflowService)

  async execute(options) {
    await this.workflowService.executeFromConfig(options.workflow, {
      environment: options.environment,
    })
    console.log(`Workflow ${options.workflow} completed`)
  }
}
```

## Module Organization

Organize workflow commands into a module:

```typescript
import { CliModule } from '@navios/commander'
import { DeployCommand } from './commands/deploy.command'
import { DatabaseSetupCommand } from './commands/database-setup.command'
import { ConditionalDeployCommand } from './commands/conditional-deploy.command'
import { ParallelRunCommand } from './commands/parallel-run.command'
import { DeployWithRollbackCommand } from './commands/deploy-with-rollback.command'
import { RunWorkflowCommand } from './commands/run-workflow.command'

@CliModule({
  commands: [
    DeployCommand,
    DatabaseSetupCommand,
    ConditionalDeployCommand,
    ParallelRunCommand,
    DeployWithRollbackCommand,
    RunWorkflowCommand,
  ],
})
export class WorkflowModule {}
```

## Usage Examples

```bash
# Deployment workflow
node cli.js deploy --environment production
node cli.js deploy --environment staging --skipTests
node cli.js deploy --environment production --skipMigrations

# Database setup
node cli.js db:setup
node cli.js db:setup --reset
node cli.js db:setup --reset --seed

# Conditional deployment
node cli.js deploy:conditional --environment production

# Parallel execution
node cli.js run:parallel --tasks "test:unit,test:integration,lint"

# Deployment with rollback
node cli.js deploy:with-rollback --environment production

# Configurable workflows
node cli.js workflow:run --workflow deploy --environment production
node cli.js workflow:run --workflow setup
```

