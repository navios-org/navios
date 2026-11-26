export {
  extractTraceContext,
  getCurrentSpan,
  injectTraceContext,
  parentContext,
  RequestSpan,
} from './context.mjs'
export type { HeaderCarrier } from './context.mjs'
export { recordSpanError } from './span.mjs'
