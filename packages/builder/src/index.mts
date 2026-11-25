// HTTP endpoint builder
export { builder } from './http/builder.mjs'
export type { BuilderConfig, BuilderContext } from './http/builder-config.mjs'
export type { BuilderInstance } from './http/builder-instance.mjs'

// HTTP client contract
export type { AbstractRequestConfig, AbstractResponse, Client, HttpMethod } from './http/client.mjs'

// Endpoint declaration
export type {
  BaseEndpointOptions,
  ClientOptions,
  EndpointBodyKind,
  EndpointOptions,
  EndpointResponseKind,
  SuccessSchemaRecord,
} from './http/endpoint-options.mjs'
export type { ErrorSchemaRecord, InferErrorSchemaOutput } from './http/error-schema.mjs'
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
} from './http/endpoint-handler.mjs'
export { assertValidDeclaration, createHandler } from './http/create-handler.mjs'
export type { HandlerCallOptions, HandlerRequest } from './http/create-handler.mjs'

// Request
export type {
  ClientRequestArgs,
  RequestArgsOptions,
  RequestBase,
  ServerRequestArgs,
} from './http/request-args.mjs'
export { makeConfig, makeFormData } from './http/make-config.mjs'
export type { ConfigRequest } from './http/make-config.mjs'

// Response
export type { SafeResult, SafeResultErr, SafeResultOk } from './http/safe-result.mjs'
export { toResponseMeta } from './http/response-meta.mjs'
export type { ResponseMeta } from './http/response-meta.mjs'
export { getCookie, getHeader, getRetryAfterMs } from './http/response-headers.mjs'

// Errors
export { EndpointError, isEndpointError, isHttpError } from './http/endpoint-error.mjs'
export type {
  EndpointErrorInit,
  EndpointErrorKind,
  EndpointErrorOf,
  HttpEndpointError,
  RequestValidationEndpointError,
  ResponseValidationEndpointError,
  TransportEndpointError,
  UnknownHttpEndpointError,
} from './http/endpoint-error.mjs'
export { classifyTransportFailure } from './http/transport-failure.mjs'
export { NaviosError } from './shared/navios-error.mjs'

// Schemas (Standard Schema) and validation
export type {
  InferSchemaInput,
  InferSchemaOutput,
  Schema,
  SchemaIssue,
  SchemaProps,
  SchemaResult,
} from './shared/schema.mjs'
export { parseSync, validate } from './shared/validate.mjs'
export type { ValidationOutcome } from './shared/validate.mjs'

// URL templates
export { bindUrlParams, getUrlParamNames } from './shared/bind-url-params.mjs'
export type { UrlParamsRequest } from './shared/bind-url-params.mjs'
export type { ParsePathParams, UrlHasParams, UrlParams } from './shared/url-params.mjs'

// Type helpers
export type { HasProperty, SafeGet, Simplify } from './shared/type-helpers.mjs'
