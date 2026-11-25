import {
  BadRequestException,
  inject,
  InternalServerErrorException,
  NotFoundException,
  reply,
} from '@navios/server'
import { Controller, Endpoint } from '@navios/server/legacy-compat'
import { RequestSpan } from '@navios/otel'

import type { HandlerParams, HandlerResult, RequestContext } from '@navios/server'

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
  async listItems(params: HandlerParams<typeof listItemsEndpoint>) {
    const { category, minPrice, maxPrice } = params.params
    return this.itemsService.findAll({ category, minPrice, maxPrice })
  }

  @Endpoint(getItemEndpoint)
  async getItem(params: HandlerParams<typeof getItemEndpoint>, ctx: RequestContext) {
    // The request's server span is on the request context. It is not set
    // for ignored routes or when HTTP tracing is off, hence find().
    ctx.find(RequestSpan)?.setAttribute('item.id', params.urlParams.id)
    const item = await this.itemsService.findById(params.urlParams.id)
    if (!item) {
      throw new NotFoundException('Item not found')
    }
    return item
  }

  @Endpoint(createItemEndpoint)
  async createItem(params: HandlerParams<typeof createItemEndpoint>) {
    // Validate and transform data (demonstrates nested spans)
    await this.processingService.validate(params.data)
    const transformedData = await this.processingService.transform(params.data)
    return reply(201, await this.itemsService.create(transformedData))
  }

  @Endpoint(updateItemEndpoint)
  async updateItem(params: HandlerParams<typeof updateItemEndpoint>) {
    const item = await this.itemsService.update(params.urlParams.id, params.data)
    if (!item) {
      throw new NotFoundException('Item not found')
    }
    return item
  }

  @Endpoint(deleteItemEndpoint)
  async deleteItem(params: HandlerParams<typeof deleteItemEndpoint>) {
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
  async slow(params: HandlerParams<typeof slowEndpoint>) {
    const delay = params.params.delay
    await this.processingService.simulateSlowOperation(delay)
    return { message: 'Slow operation completed', delayMs: delay }
  }

  /**
   * Error endpoint - demonstrates error traces.
   */
  @Endpoint(errorEndpoint)
  async error(params: HandlerParams<typeof errorEndpoint>): HandlerResult<typeof errorEndpoint> {
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
  async chain(params: HandlerParams<typeof chainEndpoint>) {
    const depth = params.params.depth
    const result = await this.processingService.processChain(depth)
    return { result, depth }
  }
}
