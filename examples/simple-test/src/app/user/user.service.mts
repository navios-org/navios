import { randomUUID } from 'node:crypto'

import { Injectable } from '@navios/core'

@Injectable()
export class UserService {
  getUser() {
    return {
      id: randomUUID() as string,
      name: 'John Doe',
      email: 'test@example.com',
    }
  }
}
