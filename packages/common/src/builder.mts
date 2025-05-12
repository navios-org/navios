import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  BuilderConfig,
  Client,
} from './types.mjs'
import type { BuilderInstance } from './types/index.mjs'

import { NaviosException } from './exceptions/index.mjs'
import { endpointCreator, streamCreator } from './utils/index.mjs'

export function builder(config: BuilderConfig = {}): BuilderInstance {
  let client: Client | null = null

  function getClient() {
    if (!client) {
      throw new NaviosException('[Navios-API]: Client was not provided')
    }
    return client
  }

  function declareEndpoint(options: BaseEndpointConfig) {
    return endpointCreator(options, {
      getClient,
      config,
    })
  }

  function declareStream(options: BaseStreamConfig) {
    return streamCreator(options, {
      getClient,
      config,
    })
  }

  function declareMultipart(options: BaseEndpointConfig) {
    return endpointCreator(options, {
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
