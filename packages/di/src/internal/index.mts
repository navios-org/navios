/**
 * What other Navios packages need of the container. Not for applications:
 * nothing here is covered by semantic versioning.
 */
import '../symbol-metadata.mjs'

export { constructedInstances, hasOwnProvider, setErrorReporter, setProvider } from './access.mjs'
export { disposeScope } from '../container/scoped-container.mjs'
