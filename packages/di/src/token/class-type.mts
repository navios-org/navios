export type ClassType = new (...args: any[]) => any
export type ClassTypeWithoutArguments = new () => any
export type ClassTypeWithArgument<Arg> = new (arg: Arg) => any
export type ClassTypeWithOptionalArgument<Arg> = new (arg?: Arg) => any

export type ClassTypeWithInstance<T> = new (...args: any[]) => T
export type ClassTypeWithInstanceAndArgument<T, Arg> = new (arg: Arg) => T
export type ClassTypeWithInstanceAndOptionalArgument<T, Arg> = new (arg?: Arg) => T
