import { Injectable } from '@navios/core'

import type { createUserSchema, updateUserSchema, userSchema } from '../api.mjs'
import type { z } from 'zod'

type User = z.infer<typeof userSchema>
type CreateUserInput = z.infer<typeof createUserSchema>
type UpdateUserInput = z.infer<typeof updateUserSchema>

@Injectable()
export class UserService {
  private users: Map<string, User> = new Map([
    [
      'usr_1',
      {
        id: 'usr_1',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: 'admin',
        createdAt: '2024-01-10T08:00:00Z',
      },
    ],
    [
      'usr_2',
      {
        id: 'usr_2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        role: 'user',
        createdAt: '2024-01-12T10:30:00Z',
      },
    ],
    [
      'usr_3',
      {
        id: 'usr_3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'moderator',
        createdAt: '2024-01-15T14:45:00Z',
      },
    ],
  ])

  async findAll(options: { page: number; pageSize: number; search?: string }) {
    let users = Array.from(this.users.values())

    if (options.search) {
      const search = options.search.toLowerCase()
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search),
      )
    }

    const start = (options.page - 1) * options.pageSize
    const paginatedUsers = users.slice(start, start + options.pageSize)

    return {
      users: paginatedUsers,
      total: users.length,
      page: options.page,
      pageSize: options.pageSize,
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null
  }

  async create(input: CreateUserInput): Promise<User> {
    const id = `usr_${Date.now()}`
    const user: User = {
      id,
      ...input,
      createdAt: new Date().toISOString(),
    }
    this.users.set(id, user)
    return user
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const existing = this.users.get(id)
    if (!existing) return null

    const updated: User = { ...existing, ...input }
    this.users.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.users.delete(id)
  }
}
