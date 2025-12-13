import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  BuilderConfig,
  BuilderInstance,
  Client,
} from './types/index.mjs'

import { NaviosError } from './errors/index.mjs'
import { createEndpoint, createMultipart, createStream } from './handlers/index.mjs'

export function builder(config: BuilderConfig = {}): BuilderInstance {
  let client: Client | null = null

  function getClient() {
    if (!client) {
      throw new NaviosError('[Navios-API]: Client was not provided')
    }
    return client
  }

  function declareEndpoint(options: BaseEndpointConfig) {
    return createEndpoint(options, {
      getClient,
      config,
    })
  }

  function declareStream(options: BaseStreamConfig) {
    return createStream(options, {
      getClient,
      config,
    })
  }

  function declareMultipart(options: BaseEndpointConfig) {
    return createMultipart(options, {
      getClient,
      config,
    })
  }

  function provideClient(newClient: Client) {
    client = newClient
  }

  return {
    declareEndpoint,
    declareStream,
    declareMultipart,
    provideClient,
    getClient,
  }
}
