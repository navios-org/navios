import { Injectable } from '@nestjs/common'
import { getUserById, createUser } from '../../../../shared/data.js'
import type { CreateUserInput, User, UserWithTimestamp } from '../../../../shared/schemas.js'

@Injectable()
export class UsersService {
  getById(id: string): User {
    return getUserById(id)
  }

  create(input: CreateUserInput): UserWithTimestamp {
    return createUser(input)
  }
}
