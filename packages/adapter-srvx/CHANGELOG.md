# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.2] - Unreleased

### Added

- Rest params (`/files/$path*`).
- `ctx.toWebRequest()` is the request srvx received on Bun and Deno, untouched, while nothing has read its body. On Node, where srvx's request does not take `new Request(request, init)`, it is built.

## [2.0.0-alpha.1] - 2026-11-27

The first version of the adapter: for runtimes that the Fastify and the Bun adapter do not reach.

### Added

- **`defineSrvxEnvironment(options)`** runs an application on [srvx](https://srvx.h3.dev), for Cloudflare Workers, AWS Lambda, Deno and other runtimes of the web platform.
  - **Cloudflare Workers**: before `listen()`, `app.getServer()` is a server that does not listen, whose `fetch` handles a request. The Worker needs the `nodejs_compat` flag and a compatibility date of 2024-09-23 or later.
  - **AWS Lambda**: that `fetch` goes to `handleLambdaEvent` of `srvx/aws-lambda`.
  - **Deno**: `app.listen({ port?, hostname? })` serves with `Deno.serve`.
  - **Node.js and Bun** are supported, for an application that also runs on one of the others. Their own adapters are the better choice there, and `listen()` logs a warning on Bun, where `@navios/adapter-bun` is faster.
- **`serve`** takes the options of `serve()` of srvx. `silent` is on and `gracefulShutdown` off unless they are set: an application is closed with `app.close()`.
- **`serve.maxRequestBodySize` is enforced by the adapter** on every runtime, with a 413 problem response. There is no limit when it is not set, as in srvx.
- **`cors`**, with the options and the behaviour of the Bun adapter.
- **`SrvxEnvironment`** for the `Register` declaration: `ctx.raw` is `{ request, server }`, the request of srvx with its `runtime`, `ip` and `waitUntil`.
- Routes are matched by the router of `@navios/server`.
- What a runtime does differently is evened out: the host of `ctx.url` for a request without a `Host` header on Node.js and Deno, `ctx.signal` of a client that left on Deno, a stream that closing cuts on Deno, and a quiet event stream on Bun. On Node.js a body with a declared length is read from the request of Node.
