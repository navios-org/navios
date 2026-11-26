import type { HandlerInfo } from '@navios/core'
import type { Attributes } from '@opentelemetry/api'

// Every span attribute this package sets. Those the semantic conventions
// define have their stable names; the others are this package's own.
export {
  ATTR_CODE_FUNCTION_NAME,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions'

/** The id of the request, as the request context has it. */
export const ATTR_HTTP_REQUEST_ID = 'http.request_id'
/** The id of a handler run of a transport other than HTTP. */
export const ATTR_NAVIOS_EXECUTION_ID = 'navios.execution_id'
/** The kind of the transport a handler belongs to, for example `'queue'`. */
export const ATTR_NAVIOS_TRANSPORT = 'navios.transport'
export const ATTR_NAVIOS_CONTROLLER = 'navios.controller'
export const ATTR_NAVIOS_HANDLER = 'navios.handler'
export const ATTR_NAVIOS_MODULE = 'navios.module'

/** The class, the method and the module of a handler. */
export function naviosAttributes(handler: HandlerInfo): Attributes {
  return {
    [ATTR_NAVIOS_CONTROLLER]: handler.controller.name,
    [ATTR_NAVIOS_HANDLER]: handler.handlerName,
    [ATTR_NAVIOS_MODULE]: handler.module.name,
  }
}
