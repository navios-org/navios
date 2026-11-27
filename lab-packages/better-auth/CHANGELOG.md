# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.2] - Unreleased

### Added

- The package. It replaces the 0.0.1 experiment of the same name, which had no code.
- `provideBetterAuth(options | (ctx) => options)`: a token with a Better Auth instance built by the container.
- `betterAuthPlugin({ auth, path })`: serves Better Auth on a rest param (`path/$path*`) for every method, hands it the request with `ctx.toWebRequest()` and sends its `Response` as it is, and checks at start-up that `path` is Better Auth's base path.
- `AuthSession`, `requireSession`, `BetterAuthGuard` and `AllowAnonymous`: the session of a request, looked up once, and a guard. `BetterAuthRegister` types the session with the application's options.
- `authForCli(token, { module, providers, plugins })`: the instance for Better Auth's CLI, built from the application's modules. Run the CLI on Bun: `bun --bun x auth migrate --config auth.config.mts`.
