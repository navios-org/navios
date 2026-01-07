import { Injectable } from '@navios/core'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'guest'
  createdAt: string
  avatarUrl?: string
}

export interface CreateUserDto {
  name: string
  email: string
  role?: 'admin' | 'user' | 'guest'
}

export interface UpdateUserDto {
  name?: string
  email?: string
  role?: 'admin' | 'user' | 'guest'
}

@Injectable()
export class UsersService {
  private users: Map<string, User> = new Map()
  private idCounter = 0

  async findAll(page: number, limit: number): Promise<{ users: User[]; total: number }> {
    const allUsers = Array.from(this.users.values())
    const start = (page - 1) * limit
    const users = allUsers.slice(start, start + limit)
    return { users, total: allUsers.length }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null
  }

  async create(dto: CreateUserDto): Promise<User> {
    const id = `user-${++this.idCounter}`
    const user: User = {
      id,
      name: dto.name,
      email: dto.email,
      role: dto.role ?? 'user',
      createdAt: new Date().toISOString(),
    }
    this.users.set(id, user)
    return user
  }

  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    const user = this.users.get(id)
    if (!user) {
      return null
    }
    const updated: User = {
      ...user,
      ...(dto.name && { name: dto.name }),
      ...(dto.email && { email: dto.email }),
      ...(dto.role && { role: dto.role }),
    }
    this.users.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  async setAvatar(id: string, avatarUrl: string): Promise<User | null> {
    const user = this.users.get(id)
    if (!user) {
      return null
    }
    const updated: User = { ...user, avatarUrl }
    this.users.set(id, updated)
    return updated
  }

  async clear(): Promise<void> {
    this.users.clear()
    this.idCounter = 0
  }
}
