/**
 * The parameters of a function that takes options: they may be left out when
 * none of them is required.
 */
export type OptionsArgument<Options, Rest extends unknown[] = []> = {} extends Options
  ? [options?: Options, ...rest: Rest]
  : [options: Options, ...rest: Rest]
