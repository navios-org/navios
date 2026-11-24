/**
 * Standard decorators record class metadata under `Symbol.metadata`, and the
 * code compilers emit for them hands a decorator no metadata object when that
 * symbol does not exist. Runtimes without it (Node.js at the time of writing)
 * need it defined before the first decorated class is evaluated.
 *
 * Every entry point of the package imports this module first. A decorated
 * class imports its decorators from the package, so this runs before the
 * class is evaluated.
 */
;(Symbol as { metadata?: symbol }).metadata ??= Symbol('Symbol.metadata')

export {}
