export declare function envInt(key: keyof NodeJS.ProcessEnv, defaultValue: number): number;
export declare function envString<DefaultValue extends string | undefined, Ensured = DefaultValue extends string ? true : false>(key: keyof NodeJS.ProcessEnv, defaultValue?: DefaultValue): Ensured extends true ? string : string | undefined;
//# sourceMappingURL=helpers.d.mts.map