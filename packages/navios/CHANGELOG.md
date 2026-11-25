# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Empty JSON bodies**: with `responseType: 'json'` (the default) an empty body, such as a 204, resolves with `data: undefined` instead of rejecting with a `SyntaxError`.
- **Unparsable bodies keep the response**: a 2xx body that is not valid JSON rejects with a `NaviosError` whose `response` has the status, the headers and the raw text as `data`. An error status with an empty or malformed JSON body rejects with its `response` too (`data` is `undefined` or the raw text) instead of a bare `SyntaxError`.
- **`timeout`** is implemented: the request is aborted with `AbortSignal.timeout`, combined with a `signal` given by the caller. A timeout rejects with `code: 'ECONNABORTED'`, an abort with `code: 'ERR_CANCELED'`; the original error is the `cause`.
- **`params` are merged into a URL that already has a query string** instead of being dropped.
- **String bodies are sent** as they are, with `Content-Type: text/plain` unless a content type is set.
- **`DELETE` and `OPTIONS` requests send their `data`**; `client.delete(url, { data })` is typed. `GET` and `HEAD` bodies are still not sent.
- **Package metadata**: a `files` allowlist and the `repository` field.
