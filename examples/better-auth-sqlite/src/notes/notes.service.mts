import { inject, Injectable } from '@navios/server'

import { Database } from '../database.mjs'

export interface Note {
  id: number
  text: string
  createdAt: string
}

@Injectable()
export class NotesService {
  private readonly db = inject(Database)

  list(userId: string): Note[] {
    return this.db.connection
      .query<Note, [string]>('select id, text, createdAt from note where userId = ? order by id')
      .all(userId)
  }

  create(userId: string, text: string): Note {
    return this.db.connection
      .query<Note, [string, string]>(
        'insert into note (userId, text) values (?, ?) returning id, text, createdAt',
      )
      .get(userId, text)!
  }
}
