// The context helpers live in `@navios/di` and are re-exported by core, so
// that every package's legacy decorators share one metadata store per class.
export { createClassContext, createMethodContext } from '@navios/core/legacy-compat'
