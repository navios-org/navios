import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'

import type { AttributeValue } from '@opentelemetry/api'
import type { Resource } from '@opentelemetry/resources'

import type { ResolvedOtelConfig } from '../config/otel-config.mjs'

/**
 * The resource that describes the service: its name, version, environment
 * and the configured `resourceAttributes`.
 */
export function createResource(config: ResolvedOtelConfig): Resource {
  const attributes: Record<string, AttributeValue> = {
    ...config.resourceAttributes,
    [ATTR_SERVICE_NAME]: config.serviceName,
  }
  if (config.serviceVersion) {
    attributes[ATTR_SERVICE_VERSION] = config.serviceVersion
  }
  if (config.environment) {
    attributes[ATTR_DEPLOYMENT_ENVIRONMENT_NAME] = config.environment
  }
  return resourceFromAttributes(attributes)
}
