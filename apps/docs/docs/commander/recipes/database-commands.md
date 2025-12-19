---
sidebar_position: 1
---

# Database Commands

This recipe shows how to create CLI commands for database operations like migrations, seeding, and queries.

## Migration Commands

Create commands for database migrations:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'

@Injectable()
class MigrationService {
  async migrate(version?: string) {
    // Migration logic
    console.log(`Migrating to version: ${version || 'latest'}`)
  }

  async rollback(version?: string) {
    // Rollback logic
    console.log(`Rolling back to version: ${version || 'previous'}`)
  }

  async status() {
    // Status logic
    return { current: '1.0.0', pending: ['1.0.1', '1.0.2'] }
  }
}

const migrateSchema = z.object({
  version: z.string().optional(),
  force: z.boolean().default(false),
})

@Command({
  path: 'db:migrate',
  optionsSchema: migrateSchema,
})
export class MigrateCommand implements CommandHandler<
  z.infer<typeof migrateSchema>
> {
  private migrationService = inject(MigrationService)

  async execute(options) {
    if (options.force) {
      console.log('Force migration enabled')
    }
    await this.migrationService.migrate(options.version)
  }
}

const rollbackSchema = z.object({
  version: z.string().optional(),
  steps: z.number().optional(),
})

@Command({
  path: 'db:rollback',
  optionsSchema: rollbackSchema,
})
export class RollbackCommand implements CommandHandler<
  z.infer<typeof rollbackSchema>
> {
  private migrationService = inject(MigrationService)

  async execute(options) {
    if (options.steps) {
      // Rollback N steps
      for (let i = 0; i < options.steps; i++) {
        await this.migrationService.rollback()
      }
    } else {
      await this.migrationService.rollback(options.version)
    }
  }
}

@Command({ path: 'db:status' })
export class StatusCommand implements CommandHandler {
  private migrationService = inject(MigrationService)

  async execute() {
    const status = await this.migrationService.status()
    console.log('Current version:', status.current)
    console.log('Pending migrations:', status.pending.join(', '))
  }
}
```

## Seed Commands

Create commands for database seeding:

```typescript
@Injectable()
class SeedService {
  async seed(seeders?: string[]) {
    if (seeders && seeders.length > 0) {
      // Seed specific seeders
      for (const seeder of seeders) {
        await this.runSeeder(seeder)
      }
    } else {
      // Seed all
      await this.runAllSeeders()
    }
  }

  private async runSeeder(name: string) {
    console.log(`Running seeder: ${name}`)
    // Seeder logic
  }

  private async runAllSeeders() {
    console.log('Running all seeders')
    // Run all seeders
  }
}

const seedSchema = z.object({
  seeders: z.array(z.string()).optional(),
  reset: z.boolean().default(false),
})

@Command({
  path: 'db:seed',
  optionsSchema: seedSchema,
})
export class SeedCommand implements CommandHandler<
  z.infer<typeof seedSchema>
> {
  private seedService = inject(SeedService)

  async execute(options) {
    if (options.reset) {
      console.log('Resetting database before seeding')
      // Reset logic
    }
    await this.seedService.seed(options.seeders)
  }
}
```

## Query Commands

Create commands for database queries:

```typescript
@Injectable()
class DatabaseService {
  async query(sql: string) {
    // Execute query
    return { rows: [], count: 0 }
  }

  async execute(sql: string) {
    // Execute statement
    return { affectedRows: 0 }
  }
}

const querySchema = z.object({
  sql: z.string(),
  format: z.enum(['table', 'json', 'csv']).default('table'),
})

@Command({
  path: 'db:query',
  optionsSchema: querySchema,
})
export class QueryCommand implements CommandHandler<
  z.infer<typeof querySchema>
> {
  private db = inject(DatabaseService)

  async execute(options) {
    const result = await this.db.query(options.sql)
    
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2))
    } else if (options.format === 'csv') {
      // Format as CSV
      console.log(this.formatAsCsv(result.rows))
    } else {
      // Format as table
      console.log(this.formatAsTable(result.rows))
    }
  }

  private formatAsTable(rows: any[]) {
    // Table formatting logic
    return rows.map(row => Object.values(row).join('\t')).join('\n')
  }

  private formatAsCsv(rows: any[]) {
    // CSV formatting logic
    return rows.map(row => Object.values(row).join(',')).join('\n')
  }
}
```

## Backup and Restore Commands

Create commands for database backup and restore:

```typescript
@Injectable()
class BackupService {
  async backup(path: string) {
    console.log(`Creating backup to ${path}`)
    // Backup logic
    return { path, size: 1024 * 1024, timestamp: new Date() }
  }

  async restore(path: string) {
    console.log(`Restoring from ${path}`)
    // Restore logic
  }

  async list() {
    return [
      { path: 'backup1.sql', size: 1024 * 1024, date: new Date() },
      { path: 'backup2.sql', size: 2048 * 1024, date: new Date() },
    ]
  }
}

const backupSchema = z.object({
  path: z.string(),
  compress: z.boolean().default(false),
})

@Command({
  path: 'db:backup',
  optionsSchema: backupSchema,
})
export class BackupCommand implements CommandHandler<
  z.infer<typeof backupSchema>
> {
  private backupService = inject(BackupService)

  async execute(options) {
    const backup = await this.backupService.backup(options.path)
    console.log(`Backup created: ${backup.path} (${backup.size} bytes)`)
  }
}

const restoreSchema = z.object({
  path: z.string(),
  force: z.boolean().default(false),
})

@Command({
  path: 'db:restore',
  optionsSchema: restoreSchema,
})
export class RestoreCommand implements CommandHandler<
  z.infer<typeof restoreSchema>
> {
  private backupService = inject(BackupService)

  async execute(options) {
    if (options.force) {
      console.log('Force restore enabled')
    }
    await this.backupService.restore(options.path)
  }
}

@Command({ path: 'db:backups' })
export class ListBackupsCommand implements CommandHandler {
  private backupService = inject(BackupService)

  async execute() {
    const backups = await this.backupService.list()
    console.log('Available backups:')
    backups.forEach((backup) => {
      console.log(`  - ${backup.path} (${backup.size} bytes)`)
    })
  }
}
```

## Module Organization

Organize database commands into a module:

```typescript
import { CliModule } from '@navios/commander'
import { MigrateCommand } from './commands/migrate.command'
import { RollbackCommand } from './commands/rollback.command'
import { StatusCommand } from './commands/status.command'
import { SeedCommand } from './commands/seed.command'
import { QueryCommand } from './commands/query.command'
import { BackupCommand } from './commands/backup.command'
import { RestoreCommand } from './commands/restore.command'
import { ListBackupsCommand } from './commands/list-backups.command'

@CliModule({
  commands: [
    MigrateCommand,
    RollbackCommand,
    StatusCommand,
    SeedCommand,
    QueryCommand,
    BackupCommand,
    RestoreCommand,
    ListBackupsCommand,
  ],
})
export class DatabaseModule {}
```

## Usage Examples

```bash
# Run migrations
node cli.js db:migrate
node cli.js db:migrate --version 1.0.1
node cli.js db:migrate --force

# Rollback migrations
node cli.js db:rollback
node cli.js db:rollback --version 1.0.0
node cli.js db:rollback --steps 2

# Check migration status
node cli.js db:status

# Seed database
node cli.js db:seed
node cli.js db:seed --seeders UserSeeder ProductSeeder
node cli.js db:seed --reset

# Query database
node cli.js db:query --sql "SELECT * FROM users"
node cli.js db:query --sql "SELECT * FROM users" --format json

# Backup and restore
node cli.js db:backup --path backup.sql
node cli.js db:backup --path backup.sql --compress
node cli.js db:restore --path backup.sql
node cli.js db:restore --path backup.sql --force
node cli.js db:backups
```

