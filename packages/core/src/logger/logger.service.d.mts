import type { LoggerService } from './logger-service.interface.mjs';
import type { LoggerOptions } from './logger.tokens.mjs';
/**
 * Logger service instance that can be injected into services and controllers.
 *
 * Provides contextualized logging with automatic context injection.
 * The context is set when the logger is injected using the `inject` function.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   private logger = inject(Logger, { context: UserService.name })
 *
 *   async findUser(id: string) {
 *     this.logger.log(`Finding user ${id}`)
 *     // Logs with context: [UserService]
 *   }
 * }
 * ```
 */
export declare class LoggerInstance implements LoggerService {
    protected localInstance: LoggerService;
    protected context?: string;
    constructor(config?: LoggerOptions);
    /**
     * Write an 'error' level log.
     */
    error(message: any, stack?: string, context?: string): void;
    error(message: any, ...optionalParams: [...any, string?, string?]): void;
    /**
     * Write a 'log' level log.
     */
    log(message: any, context?: string): void;
    log(message: any, ...optionalParams: [...any, string?]): void;
    /**
     * Write a 'warn' level log.
     */
    warn(message: any, context?: string): void;
    warn(message: any, ...optionalParams: [...any, string?]): void;
    /**
     * Write a 'debug' level log.
     */
    debug(message: any, context?: string): void;
    debug(message: any, ...optionalParams: [...any, string?]): void;
    /**
     * Write a 'verbose' level log.
     */
    verbose(message: any, context?: string): void;
    verbose(message: any, ...optionalParams: [...any, string?]): void;
    /**
     * Write a 'fatal' level log.
     */
    fatal(message: any, context?: string): void;
    fatal(message: any, ...optionalParams: [...any, string?]): void;
}
//# sourceMappingURL=logger.service.d.mts.map