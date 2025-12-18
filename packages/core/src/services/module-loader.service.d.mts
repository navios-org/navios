import type { ClassTypeWithInstance } from '@navios/di';
import { Container } from '@navios/di';
import type { NaviosModule } from '../interfaces/index.mjs';
import type { ModuleMetadata } from '../metadata/index.mjs';
export declare class ModuleLoaderService {
    private logger;
    protected container: Container;
    private modulesMetadata;
    private loadedModules;
    private initialized;
    loadModules(appModule: ClassTypeWithInstance<NaviosModule>): Promise<void>;
    private traverseModules;
    private mergeMetadata;
    getAllModules(): Map<string, ModuleMetadata>;
    dispose(): void;
}
//# sourceMappingURL=module-loader.service.d.mts.map