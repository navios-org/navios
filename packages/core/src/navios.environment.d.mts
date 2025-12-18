import type { AnyInjectableType, InjectionToken } from '@navios/di';
export interface NaviosEnvironmentOptions {
    httpTokens?: Map<InjectionToken<any, undefined>, AnyInjectableType>;
}
export declare class NaviosEnvironment {
    private httpTokens;
    setupHttpEnvironment(tokens: Map<InjectionToken<any, undefined>, AnyInjectableType>): void;
    getHttpToken(token: InjectionToken<any, undefined>): AnyInjectableType | undefined;
    hasHttpSetup(): boolean;
}
//# sourceMappingURL=navios.environment.d.mts.map