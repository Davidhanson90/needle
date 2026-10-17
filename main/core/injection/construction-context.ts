import type { IInjector } from '../../contracts/contracts.js';

/**
 * Tracks the injector that is currently constructing a type.
 *
 * Standard (TC39) decorators cannot decorate constructor parameters, so field and accessor injection needs another
 * way to find "the injector that is building me". `createInstance` pushes its injector here around `new type(...)`
 * and the field/accessor initialisers read it back while the instance is being initialised.
 */
const stack: IInjector[] = [];

/**
 * Runs `fn` with `injector` marked as the injector currently constructing an instance
 */
export function runWithConstructingInjector<T>(injector: IInjector, fn: () => T): T {
    stack.push(injector);
    try {
        return fn();
    } finally {
        stack.pop();
    }
}

/**
 * The injector currently constructing an instance (if any)
 */
export function getConstructingInjector(): IInjector | undefined {
    return stack[stack.length - 1];
}
