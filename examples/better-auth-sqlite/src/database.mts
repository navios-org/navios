import { Database as SqliteDatabase } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { inject, Injectable } from '@navios/server'

import type { OnServiceDestroy, OnServiceInit } from '@navios/server'

import { AppConfig } from './app.config.mjs'

/**
 * The SQLite connection. Better Auth gets it through the `Auth` factory, the application's
 * services through `inject(Database)`, so both work on the same file.
 */
@Injectable()
export class Database implements OnServiceInit, OnServiceDestroy {
  private readonly config = inject(AppConfig)
  #connection: SqliteDatabase | null = null

  get connection(): SqliteDatabase {
    if (this.#connection === null) {
      throw new Error('The database is not open yet')
    }
    return this.#connection
  }

  onServiceInit() {
    const path = this.config.getOrThrow('databasePath')
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true })
    }
    this.#connection = new SqliteDatabase(path, { create: true })
    // The application's own table. Better Auth's tables come from its CLI: `yarn auth:migrate`.
    this.#connection.run(`
      create table if not exists note (
        id integer primary key autoincrement,
        userId text not null,
        text text not null,
        createdAt text not null default (datetime('now'))
      )
    `)
  }

  onServiceDestroy() {
    this.#connection?.close()
    this.#connection = null
  }
}
