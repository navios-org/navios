import type { BaseEndpointConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'

import { Container } from '@navios/core'

import { beforeEach, describe, expect, it, vi } from 'bun:test'

import { BunMultipartAdapterService } from '../multipart-adapter.service.mjs'

describe('BunMultipartAdapterService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  it('should be defined', () => {
    expect(BunMultipartAdapterService).toBeDefined()
  })

  it('should extend BunEndpointAdapterService', async () => {
    const service = await container.get(BunMultipartAdapterService)
    expect(service).toBeInstanceOf(BunMultipartAdapterService)
  })

  it('should handle form data correctly', async () => {
    const service = await container.get(BunMultipartAdapterService)

    // Mock handler metadata with request schema
    const mockHandlerMetadata: HandlerMetadata<BaseEndpointConfig> = {
      config: {
        method: 'POST',
        url: '/upload',
        querySchema: {
          parse: vi.fn().mockReturnValue({}),
        },
        requestSchema: {
          parse: vi
            .fn()
            .mockReturnValue({ file: 'mock-file', text: 'mock-text' }),
        },
      },
      classMethod: 'upload',
      successStatusCode: 200,
      headers: {},
    } as any

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
      // @ts-expect-error - File is not defined in the global scope
      mockHandlerMetadata.config.requestSchema?.parse,
    ).toHaveBeenCalledWith({
      file: expect.any(File),
      text: 'hello world',
    })
  })

  it('should handle multiple files with same field name', async () => {
    const service = await container.get(BunMultipartAdapterService)

    const mockHandlerMetadata: HandlerMetadata<BaseEndpointConfig> = {
      config: {
        method: 'POST',
        url: '/upload',
        querySchema: {
          parse: vi.fn().mockReturnValue({}),
        },
        requestSchema: {
          parse: vi.fn().mockReturnValue({ files: ['file1', 'file2'] }),
        },
      },
      classMethod: 'upload',
      successStatusCode: 200,
      headers: {},
    } as any

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
      // @ts-expect-error - File is not defined in the global scope
      mockHandlerMetadata.config.requestSchema?.parse,
    ).toHaveBeenCalledWith({
      files: [expect.any(File), expect.any(File)],
    })
  })
})
