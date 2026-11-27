import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleDir = fileURLToPath(new URL('..', import.meta.url))

/** Runs a command in the example with the database at `databasePath`. */
function run(command: string, args: string[], databasePath: string) {
  const { NODE_OPTIONS: _, ...env } = process.env
  const result = spawnSync(command, args, {
    cwd: exampleDir,
    env: { ...env, DATABASE_PATH: databasePath },
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

function tablesOf(databasePath: string): string[] {
  const db = new Database(databasePath, { readonly: true })
  try {
    return db
      .query<{ name: string }, []>(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
      )
      .all()
      .map((row) => row.name)
  } finally {
    db.close()
  }
}

describe('the Better Auth CLI, on the application built by DI', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'navios-better-auth-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('should migrate the database the application uses', () => {
    const databasePath = join(dir, 'app.db')

    const { status, output } = run('yarn', ['auth:migrate', '--yes'], databasePath)

    expect(output).toContain('migration was completed successfully')
    expect(status).toBe(0)
    // Better Auth's tables, and the application's own `note` table, made by its Database service.
    expect(tablesOf(databasePath)).toEqual(['account', 'note', 'session', 'user', 'verification'])
  })

  it('should pass its schema check after the migration', () => {
    const databasePath = join(dir, 'app.db')
    run('yarn', ['auth:migrate', '--yes'], databasePath)

    const { status, output } = run('yarn', ['auth:check'], databasePath)

    expect(output).toContain('Schema check passed')
    expect(status).toBe(0)
  })

  it('should generate the SQL of the schema, with the additional field', () => {
    const schemaPath = join(dir, 'schema.sql')

    const { status } = run(
      'yarn',
      ['auth:generate', '--output', schemaPath, '--yes'],
      join(dir, 'app.db'),
    )

    expect(status).toBe(0)
    const sql = readFileSync(schemaPath, 'utf8')
    expect(sql).toContain('create table "user"')
    expect(sql).toMatch(/"plan" text/)
  })

  it('should not load the application on Node, which is why the scripts run the CLI on Bun', () => {
    const bin = spawnSync('yarn', ['bin', 'auth'], { cwd: exampleDir, encoding: 'utf8' })

    const { status, output } = run(
      'node',
      [bin.stdout.trim(), 'migrate', '--config', 'auth.config.mts', '--yes'],
      join(dir, 'app.db'),
    )

    expect(status).not.toBe(0)
    expect(output).toContain("Couldn't load your auth config")
  })
})
