import type { EndpointParams } from '@navios/core'

import { inject } from '@navios/core'
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@navios/core'
import { Controller, Endpoint, HttpCode } from '@navios/core/legacy-compat'

import {
  chainEndpoint,
  createItemEndpoint,
  deleteItemEndpoint,
  errorEndpoint,
  getItemEndpoint,
  listItemsEndpoint,
  slowEndpoint,
  updateItemEndpoint,
} from '../../api/endpoints.mjs'

import { ItemsService } from './items.service.mjs'
import { ProcessingService } from './processing.service.mjs'

@Controller()
export class ItemsController {
  private readonly itemsService = inject(ItemsService)
  private readonly processingService = inject(ProcessingService)

  @Endpoint(listItemsEndpoint)
  async listItems(params: EndpointParams<typeof listItemsEndpoint>) {
    const { category, minPrice, maxPrice } = params.params
    return this.itemsService.findAll({ category, minPrice, maxPrice })
  }

  @Endpoint(getItemEndpoint)
  async getItem(params: EndpointParams<typeof getItemEndpoint>) {
    const item = await this.itemsService.findById(params.urlParams.id)
    if (!item) {
      throw new NotFoundException('Item not found')
    }
    return item
  }

  @Endpoint(createItemEndpoint)
  @HttpCode(201)
  async createItem(params: EndpointParams<typeof createItemEndpoint>) {
    // Validate and transform data (demonstrates nested spans)
    await this.processingService.validate(params.data)
    const transformedData = await this.processingService.transform(params.data)
    return this.itemsService.create(transformedData)
  }

  @Endpoint(updateItemEndpoint)
  async updateItem(params: EndpointParams<typeof updateItemEndpoint>) {
    const item = await this.itemsService.update(params.urlParams.id, params.data)
    if (!item) {
      throw new NotFoundException('Item not found')
    }
    return item
  }

  @Endpoint(deleteItemEndpoint)
  async deleteItem(params: EndpointParams<typeof deleteItemEndpoint>) {
    const deleted = await this.itemsService.delete(params.urlParams.id)
    if (!deleted) {
      throw new NotFoundException('Item not found')
    }
    return { success: true, message: 'Item deleted successfully' }
  }

  /**
   * Slow endpoint - demonstrates long-running operations in traces.
   */
  @Endpoint(slowEndpoint)
  async slow(params: EndpointParams<typeof slowEndpoint>) {
    const delay = params.params.delay
    await this.processingService.simulateSlowOperation(delay)
    return { message: 'Slow operation completed', delayMs: delay }
  }

  /**
   * Error endpoint - demonstrates error traces.
   */
  @Endpoint(errorEndpoint)
  async error(params: EndpointParams<typeof errorEndpoint>) {
    const type = params.params.type

    switch (type) {
      case 'validation':
        throw new BadRequestException('Validation error: Invalid input data')
      case 'not-found':
        throw new NotFoundException('Resource not found')
      case 'internal':
      default:
        throw new InternalServerErrorException('Internal server error occurred')
    }
  }

  /**
   * Chain endpoint - demonstrates nested spans with recursive operations.
   */
  @Endpoint(chainEndpoint)
  async chain(params: EndpointParams<typeof chainEndpoint>) {
    const depth = params.params.depth
    const result = await this.processingService.processChain(depth)
    return { result, depth }
  }
}
