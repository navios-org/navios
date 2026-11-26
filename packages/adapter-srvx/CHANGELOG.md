# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

The first version of the adapter.

### Added

- **`defineSrvxEnvironment(options)`** runs an application on [srvx](https://srvx.h3.dev). `app.listen({ port?, hostname? })` serves it on Node.js, Deno and Bun. Before `listen()`, `app.getServer()` is a server that does not listen, whose `fetch` handles a request: for a runtime that calls the application itself, such as Cloudflare Workers.
- **`serve`** takes the options of `serve()` of srvx. `silent` is on and `gracefulShutdown` off unless they are set: an application is closed with `app.close()`.
- **`serve.maxRequestBodySize` is enforced by the adapter** on every runtime, with a 413 problem response. There is no limit when it is not set, as in srvx.
- **`cors`**, with the options and the behaviour of the Bun adapter.
- **`SrvxEnvironment`** for the `Register` declaration: `ctx.raw` is `{ request, server }`, the request of srvx with its `runtime`, `ip` and `waitUntil`.
- **A warning on Bun**, logged by `listen()`: `@navios/adapter-bun` is the faster adapter there.
- Routes are matched by the router of `@navios/server`. On Node.js a body with a declared length is read from the request of Node, and on Bun an event stream is not closed for being quiet.
