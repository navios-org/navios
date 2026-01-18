import { Injectable } from '@navios/core/legacy-compat'
import { Traced } from '@navios/otel/legacy-compat'

import type { Item } from '../../api/endpoints.mjs'

/**
 * Items service with OpenTelemetry tracing.
 *
 * The @Traced decorator on the class automatically traces all public methods.
 * Each method execution creates a child span under the HTTP request span.
 */
@Injectable()
@Traced({ name: 'items-service' })
export class ItemsService {
  private items: Map<string, Item> = new Map()
  private idCounter = 0

  /**
   * Find all items with optional filtering.
   * Creates span: "items-service.findAll"
   */
  async findAll(filters?: {
    category?: string
    minPrice?: number
    maxPrice?: number
  }): Promise<{ items: Item[]; total: number }> {
    let items = Array.from(this.items.values())

    if (filters?.category) {
      items = items.filter((item) => item.category === filters.category)
    }

    if (filters?.minPrice !== undefined) {
      items = items.filter((item) => item.price >= filters.minPrice!)
    }

    if (filters?.maxPrice !== undefined) {
      items = items.filter((item) => item.price <= filters.maxPrice!)
    }

    return { items, total: items.length }
  }

  /**
   * Find item by ID.
   * Creates span: "items-service.findById"
   */
  async findById(id: string): Promise<Item | null> {
    return this.items.get(id) ?? null
  }

  /**
   * Create a new item.
   * Creates span: "items-service.create"
   */
  async create(data: {
    name: string
    description?: string
    price: number
    category: string
  }): Promise<Item> {
    const id = `item-${++this.idCounter}`
    const item: Item = {
      id,
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      createdAt: new Date().toISOString(),
    }
    this.items.set(id, item)
    return item
  }

  /**
   * Update an existing item.
   * Creates span: "items-service.update"
   */
  async update(
    id: string,
    data: Partial<Omit<Item, 'id' | 'createdAt'>>,
  ): Promise<Item | null> {
    const item = this.items.get(id)
    if (!item) return null

    const updated: Item = { ...item, ...data }
    this.items.set(id, updated)
    return updated
  }

  /**
   * Delete an item.
   * Creates span: "items-service.delete"
   */
  async delete(id: string): Promise<boolean> {
    return this.items.delete(id)
  }
}
