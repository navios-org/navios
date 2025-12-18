import type { HttpMethod } from '@navios/builder';
import type { ClassTypeWithInstance, InjectionToken } from '@navios/di';
import type { AbstractHttpHandlerAdapterInterface, CanActivate, HttpHeader } from '../interfaces/index.mjs';
export declare const EndpointMetadataKey: unique symbol;
export interface HandlerMetadata<Config = null> {
    classMethod: string;
    url: string;
    successStatusCode: number;
    adapterToken: InjectionToken<AbstractHttpHandlerAdapterInterface, undefined> | ClassTypeWithInstance<AbstractHttpHandlerAdapterInterface> | null;
    headers: Partial<Record<HttpHeader, number | string | string[] | undefined>>;
    httpMethod: HttpMethod;
    config: Config;
    guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>;
    customAttributes: Map<string | symbol, any>;
}
export declare function getAllEndpointMetadata(context: ClassMethodDecoratorContext | ClassDecoratorContext): Set<HandlerMetadata<any>>;
export declare function getEndpointMetadata<Config = any>(target: Function, context: ClassMethodDecoratorContext): HandlerMetadata<Config>;
//# sourceMappingURL=handler.metadata.d.mts.map