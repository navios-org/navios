import { Injectable } from '@navios/core/legacy-compat'

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'guest'
  avatarUrl?: string
  createdAt: string
}

@Injectable()
export class UsersService {
  private users: Map<string, User> = new Map()
  private idCounter = 0

  async findAll(page: number, limit: number): Promise<{ users: User[]; total: number }> {
    const allUsers = Array.from(this.users.values())
    const start = (page - 1) * limit
    const end = start + limit
    return {
      users: allUsers.slice(start, end),
      total: allUsers.length,
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null
  }

  async create(data: { name: string; email: string; role?: 'admin' | 'user' | 'guest' }): Promise<User> {
    const id = `user-${++this.idCounter}`
    const user: User = {
      id,
      name: data.name,
      email: data.email,
      role: data.role ?? 'user',
      createdAt: new Date().toISOString(),
    }
    this.users.set(id, user)
    return user
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> {
    const user = this.users.get(id)
    if (!user) return null

    const updated: User = { ...user, ...data }
    this.users.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.users.delete(id)
  }

  async setAvatar(id: string, avatarUrl: string): Promise<User | null> {
    const user = this.users.get(id)
    if (!user) return null

    user.avatarUrl = avatarUrl
    return user
  }
}
