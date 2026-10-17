import { IDependencyDescriptor, IInjectionConfiguration, ITokenCache, Newable } from '../../contracts/contracts.js';
import { generateUUID } from '../uuid.js';

/** Placeholder constructor type for parameters whose value is not resolved from a type (token, lazy, factory, strategy) */
const PLACEHOLDER = Object as unknown as Newable;

/**
 * Turns an explicit `deps` list (the standard-decorator replacement for parameter decorators + design:paramtypes)
 * into `metadata` (the param types) plus parameter tokens registered on the given token cache.
 * A plain constructor in the list is a type dependency; descriptors (see `dep`) cover the rest.
 */
export function applyDeps(
    tokenCache: ITokenCache,
    owner: unknown,
    config: IInjectionConfiguration,
): IInjectionConfiguration {
    const deps = config.deps;
    if (deps == null) {
        return config;
    }
    const metadata: Newable[] = deps.map((d, index) => {
        if (typeof d === 'function') {
            return d as Newable;
        }
        return applyDescriptor(tokenCache, owner, index, d);
    });
    // explicit metadata wins if the user supplied both, deps then only contributes tokens
    return { ...config, metadata: (config.metadata ?? metadata) as never };
}

function applyDescriptor(tokenCache: ITokenCache, owner: unknown, index: number, d: IDependencyDescriptor): Newable {
    const base = { owner, property: undefined as unknown as string, index };
    switch (d.kind) {
        case 'token':
            tokenCache.register({ ...base, token: d.token, injectionType: 'singleton' });
            return PLACEHOLDER;
        case 'strategy':
            tokenCache.register({ ...base, token: d.token, injectionType: 'multiple' });
            return PLACEHOLDER;
        case 'lazy':
            tokenCache.register({
                ...base,
                token: `lazy_${generateUUID()}`,
                lazyTarget: d.target,
                injectionType: 'lazy',
            });
            return PLACEHOLDER;
        case 'factory':
            tokenCache.register({
                ...base,
                token: `factory_${generateUUID()}`,
                factoryTarget: d.target,
                injectionType: 'factory',
            });
            return PLACEHOLDER;
        case 'optional': {
            tokenCache.register({ ...base, token: `optional_${generateUUID()}`, injectionType: 'optional' });
            if (typeof d.target === 'function') {
                return d.target;
            }
            // optional token
            tokenCache.register({ ...base, token: d.target, injectionType: 'singleton' });
            return PLACEHOLDER;
        }
        default:
            throw new Error(`Unknown dependency descriptor: ${JSON.stringify(d)}`);
    }
}

/**
 * Helpers for describing constructor dependencies in `@Injectable({ deps: [...] })`
 *
 * @example
 * @Injectable({ deps: [Engine, dep.token('config'), dep.optional(Logger), dep.lazy(Wheels)] })
 * class Car { constructor(engine: Engine, config: Config, logger?: Logger, wheels: LazyInstance<Wheels>) {} }
 */
export const dep = {
    /** inject whatever is registered against a string/symbol token (same as `@Inject('token')`) */
    token: (token: string | symbol): IDependencyDescriptor => ({ kind: 'token', token }),
    /** inject `undefined` rather than throwing if nothing is registered (same as `@Optional()`); target may be a type or token */
    optional: (target: Newable | string | symbol): IDependencyDescriptor => ({ kind: 'optional', target }),
    /** inject a LazyInstance (same as `@Lazy(Type)`) */
    lazy: (target: Newable): IDependencyDescriptor => ({ kind: 'lazy', target }),
    /** inject an AutoFactory (same as `@Factory(Type)`) */
    factory: (target: Newable): IDependencyDescriptor => ({ kind: 'factory', target }),
    /** inject all types registered with `strategy: name` (same as `@Strategy(name)`) */
    strategy: (token: string | symbol): IDependencyDescriptor => ({ kind: 'strategy', token }),
};
