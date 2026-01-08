import type { EndpointOptions } from '@navios/builder'
import type { HandlerMetadata, NaviosApplicationOptions } from '@navios/core'

import { NaviosOptionsToken } from '@navios/core'
import { TestContainer } from '@navios/di/testing'

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test'

import {
  BunMultipartAdapterService,
  BunMultipartAdapterToken,
} from '../adapters/multipart-adapter.service.mjs'

/**
 * Binds NaviosOptionsToken with partial options for testing.
 */
const bindNaviosOptions = (
  container: TestContainer,
  options: Partial<NaviosApplicationOptions>,
) => {
  container
    .bind(NaviosOptionsToken)
    .toValue(options as NaviosApplicationOptions)
}

const createHandlerMetadata = (
  config: Partial<EndpointOptions>,
  classMethod = 'test',
): HandlerMetadata<EndpointOptions> => ({
  classMethod,
  url: config.url ?? '',
  successStatusCode: 200,
  adapterToken: null,
  headers: {},
  httpMethod: config.method ?? 'GET',
  config: config as EndpointOptions,
  guards: new Set(),
  customAttributes: new Map(),
})

describe('BunMultipartAdapterService', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
    bindNaviosOptions(container, { validateResponses: false })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should be defined', () => {
    expect(BunMultipartAdapterService).toBeDefined()
  })

  it('should extend BunEndpointAdapterService', async () => {
    const service = await container.get(BunMultipartAdapterToken)
    expect(service).toBeInstanceOf(BunMultipartAdapterService)
  })

  it('should handle form data correctly', async () => {
    const service = await container.get(BunMultipartAdapterToken)

    // Mock handler metadata with request schema
    const mockHandlerMetadata = createHandlerMetadata({
      method: 'POST',
      url: '/upload',
      querySchema: {
        parse: vi.fn().mockReturnValue({}),
      } as any,
      requestSchema: {
        parse: vi
          .fn()
          .mockReturnValue({ file: 'mock-file', text: 'mock-text' }),
      } as any,
    } as EndpointOptions)

    // Mock BunRequest with formData method
    const mockFormData = new FormData()
    mockFormData.append(
      'file',
      new File(['content'], 'test.txt', { type: 'text/plain' }),
    )
    mockFormData.append('text', 'hello world')

    const mockRequest = {
      url: 'http://localhost:3000/upload',
      formData: vi.fn().mockResolvedValue(mockFormData),
      params: {},
    } as any

    const getters = service.prepareArguments(mockHandlerMetadata)
    expect(getters).toHaveLength(2) // query schema + request schema

    // Test the form data getter
    const formDataGetter = getters[1]
    const target: Record<string, any> = {}

    await formDataGetter(target, mockRequest)

    expect(target.data).toEqual({ file: 'mock-file', text: 'mock-text' })
    expect(
      mockHandlerMetadata.config.requestSchema?.parse,
    ).toHaveBeenCalledWith({
      file: expect.any(File),
      text: 'hello world',
    })
  })

  it('should handle multiple files with same field name', async () => {
    const service = await container.get(BunMultipartAdapterToken)

    const mockHandlerMetadata = createHandlerMetadata({
      method: 'POST',
      url: '/upload',
      querySchema: {
        parse: vi.fn().mockReturnValue({}),
      } as any,
      requestSchema: {
        parse: vi.fn().mockReturnValue({ files: ['file1', 'file2'] }),
      } as any,
    } as EndpointOptions)

    const mockFormData = new FormData()
    mockFormData.append('files', new File(['content1'], 'test1.txt'))
    mockFormData.append('files', new File(['content2'], 'test2.txt'))

    const mockRequest = {
      url: 'http://localhost:3000/upload',
      formData: vi.fn().mockResolvedValue(mockFormData),
      params: {},
    } as any

    const getters = service.prepareArguments(mockHandlerMetadata)
    const formDataGetter = getters[1]
    const target: Record<string, any> = {}

    await formDataGetter(target, mockRequest)

    expect(target.data).toEqual({ files: ['file1', 'file2'] })
    expect(
      mockHandlerMetadata.config.requestSchema?.parse,
    ).toHaveBeenCalledWith({
      files: [expect.any(File), expect.any(File)],
    })
  })
})
