# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - Unreleased

### Added

- **`HttpClientError`** with `status` and `toJSON()`, and the guard **`isHttpClientError(error)`**. `toJSON()` contains neither headers nor bodies, and `config` is not enumerable, so logging an error does not log its credentials.
- **`timeout`**: the request is aborted, together with a `signal` given by the caller. A timeout rejects with `code: 'ECONNABORTED'`, an abort with `code: 'ERR_CANCELED'`; the original error is the `cause`. It needs neither `AbortSignal.timeout` nor `AbortSignal.any`, and leaves no listener on the caller's signal, for a stream once it was read to its end or cancelled. For a stream it ends with the headers. `Infinity`, or more than a timer can wait for, is no timeout.
- **`withCredentials: true`** is `credentials: 'include'`.
- **`@navios/http/testing`**: mocks may be asynchronous and can match a query, `requests` records what was sent, and `reset()` forgets both.

### Changed

- **`NaviosError` and `NaviosInternalError` are one class, `HttpClientError`**, for error statuses, unparsable bodies, network errors, timeouts and aborts. The message of an error status is `Request failed with status 404 (Not Found)`.
- **Headers are merged without regard to case**, and names are lower-case. `defaults.headers`, `config.headers` and the headers of `error.config` are read, set and deleted by a name in any case. A header of the call or an interceptor replaces a default one instead of being appended to it. `Headers` instances and entries are accepted, `undefined` is skipped, and a content type that is set is kept.
- **`config`, as interceptors and errors see it, is not serialized**: `url` is the one that was passed, next to `baseURL`, `params` and `data`. Sending `error.config` again no longer repeats the query.
- **Interceptors**: what a response interceptor returns is used, and one that returns nothing keeps the value. Request interceptors run before `params` and `data` are serialized, and get a shallow copy of a plain object or array, so that changing it in place does not change what the caller passed. `clear()` keeps the built-in behavior. Response interceptors' `onRejected` also receives network errors and what a request interceptor throws, as in axios; the `onRejected` of a request interceptor receives what an earlier request interceptor throws, and has to return a config or throw.
- **`data`**: everything but `undefined` is sent, `null` only with a JSON content type. `URLSearchParams`, `Blob`, buffers and streams as they are, strings as they are with `Content-Type: text/plain` unless a content type is set, the rest as JSON, also `0` and `false`. `FormData` never gets a content type other than the one `fetch` chooses. `DELETE` and `OPTIONS` requests send their `data`; `GET` and `HEAD` do not.
- **`params`** are merged into a URL that already has a query string, before a `#fragment`. Array items are written like single values; `null` and `undefined` ones are left out.
- **`baseURL` and `url`** are joined with exactly one slash. A `url` with a scheme of its own is used as it is.
- **JSON error bodies** are parsed for every JSON content type, such as `application/problem+json`. A JSON body is not parsed for `responseType: 'text'`.
- **The default export** is a complete client, with `request`, `interceptors` and `defaults`, as well as a function.
- **`fetch` is looked up for every request**, so importing the package does not need it, and one that is patched later is used.
- **Types** contain no `any`: `data` of a response is `unknown` unless its type is given.

### Removed

- **`cancelToken`**, which was never read. Use `signal`.

### Fixed

- **Empty JSON bodies**: with `responseType: 'json'` (the default) an empty body, such as a 204, resolves with `data: undefined` instead of rejecting with a `SyntaxError`.
- **Unparsable bodies keep the response**: a 2xx body that is not valid JSON rejects with an error whose `response` has the status, the headers and the raw text as `data`. An error status with an empty or malformed JSON body rejects with its `response` too (`data` is `undefined` or the raw text) instead of a bare `SyntaxError`. A connection that breaks while the body is read is a failure without a response.
- **`fetch` implementations other than the global one**, such as undici's, lose neither error bodies nor headers.
- **`responseType: undefined`** and other undefined options keep the default.
- **Package metadata**: a `files` allowlist and the `repository` field.
