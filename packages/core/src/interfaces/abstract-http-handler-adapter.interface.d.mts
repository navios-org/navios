import type { ClassType, ScopedContainer } from '@navios/di';
import type { HandlerMetadata } from '../metadata/index.mjs';
export interface AbstractHttpHandlerAdapterInterface {
    prepareArguments?: (handlerMetadata: HandlerMetadata<any>) => ((target: Record<string, any>, request: any) => Promise<void> | void)[];
    provideHandler: (controller: ClassType, handlerMetadata: HandlerMetadata<any>) => (context: ScopedContainer, request: any, reply: any) => Promise<any>;
}
//# sourceMappingURL=abstract-http-handler-adapter.interface.d.mts.map