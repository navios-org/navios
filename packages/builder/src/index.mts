// HTTP endpoint builder
export { builder } from './http/builder.mjs'
export type { BuilderConfig, EndpointErrorContext } from './http/builder-config.mjs'
export type { BuilderInstance } from './http/builder-instance.mjs'

// HTTP client contract
export type {
  AbstractRequestConfig,
  AbstractResponse,
  Client,
  ClientRequestContext,
  HttpMethod,
} from './http/client.mjs'

// Endpoint declaration
export type {
  BaseEndpointOptions,
  ClientOptions,
  EndpointBodyKind,
  EndpointOptions,
  EndpointResponseKind,
  SuccessSchemaRecord,
} from './http/endpoint-options.mjs'
export type {
  ErrorSchemaRecord,
  InferErrorSchemaOutput,
  MergeErrorSchemas,
} from './http/error-schema.mjs'
export type {
  EndpointCallArgs,
  EndpointCallOptions,
  EndpointConfig,
  EndpointErrorType,
  EndpointHandler,
  EndpointParams,
  EndpointResult,
  InferEndpointError,
  InferEndpointReturn,
  InferEndpointSafeResult,
  InferSuccessInput,
  InferSuccessOutput,
  NoUnknownOptions,
  RequireResponseSchema,
  WithBuilderErrors,
} from './http/endpoint-handler.mjs'

// Request
export type { ClientRequestArgs, RequestBase, ServerRequestArgs } from './http/request-args.mjs'

// Response
export type { SafeResult, SafeResultErr, SafeResultOk } from './http/safe-result.mjs'
export type { ResponseMeta } from './http/response-meta.mjs'
export { getCookie, getFilename, getHeader, getRetryAfterMs } from './http/response-headers.mjs'
export type { HeaderSource } from './http/response-headers.mjs'

// Errors
export { EndpointError, isEndpointError, isHttpError } from './http/endpoint-error.mjs'
export type {
  EndpointErrorKind,
  EndpointErrorOf,
  EndpointIssue,
  HttpEndpointError,
  RequestPart,
  RequestValidationEndpointError,
  ResponseValidationEndpointError,
  TransportEndpointError,
  UnknownHttpEndpointError,
} from './http/endpoint-error.mjs'
export { NaviosError } from './shared/navios-error.mjs'

// Schemas (Standard Schema)
export type { InferSchemaInput, InferSchemaOutput, Schema, SchemaIssue } from './shared/schema.mjs'

// URL templates
export { bindUrlParams, getUrlParamNames } from './shared/bind-url-params.mjs'
export type { ParsePathParams, UrlHasParams, UrlParams } from './shared/url-params.mjs'
