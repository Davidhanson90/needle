import { IInjectionConfiguration } from '../contracts/contracts.js';
import { getRootInjector } from '../core/util.functions.js';
import { IStandardDecoratorContext } from './decorator-support.js';

/**
 * This is the core decorator for all injectables. Works as a legacy (`experimentalDecorators`) class decorator and as
 * a standard (TC39) class decorator.
 *
 * @Injectable()
 * class Foo{}
 *
 * @Injectable({tokens: ['bar']})
 * class Foo{}
 *
 * @Injectable({strategy: 'strategy-name'})
 * class Foo{}
 *
 * // standard decorators have no emitDecoratorMetadata, so describe the constructor explicitly
 * @Injectable({deps: [Engine, dep.token('config'), dep.optional(Logger)]})
 * class Car{ constructor(e: Engine, c: Config, l?: Logger){} }
 *
 * @param configuration
 */
export function Injectable<T>(configuration?: IInjectionConfiguration<T>) {
    // `context` is only supplied by standard decorators
    return (type: T, _context?: IStandardDecoratorContext): void => {
        getRootInjector().register(type, configuration);
    };
}
