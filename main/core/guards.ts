import {
    IExternalResolutionConfiguration,
    IFactoryParameterInjectionToken,
    IInjectionToken,
    IInjector,
    ILazyParameterInjectionToken,
    IParameterInjectionToken,
    StringOrSymbol,
    IExternalValueResolutionConfiguration,
    IBoxedValue,
    IDestroyable,
    IdleCacheStrategyType,
    ConditionalCacheStrategyType,
} from '../contracts/contracts';
import { BOXED_TYPE_ID } from '../constants/constants';

/**
 * Determines if the given type is an IInjectionTokenParameter
 * @param item
 */
export function isConstructorParameterToken(
    item: IInjectionToken | IParameterInjectionToken,
): item is IParameterInjectionToken {
    return (
        (item as IParameterInjectionToken).property !== undefined ||
        (item as IParameterInjectionToken).index !== undefined
    );
}

/**
 * Determines if the given type is an IFactoryParameterInjectionToken
 * @param item
 */
export function isFactoryParameterToken(
    item: IInjectionToken | IFactoryParameterInjectionToken,
): item is IFactoryParameterInjectionToken {
    return isConstructorParameterToken(item) && (item as IFactoryParameterInjectionToken).factoryTarget != null;
}

/**
 * Determines if the given type is a ILazyParameterInjectionToken
 * @param item
 */
export function isLazyParameterToken(
    item: IInjectionToken | ILazyParameterInjectionToken,
): item is ILazyParameterInjectionToken {
    return isConstructorParameterToken(item) && (item as ILazyParameterInjectionToken).lazyTarget != null;
}

/**
 * Determines if the value is a string or symbol
 * @param item The value being tested
 */
export function isStringOrSymbol(item: any): item is StringOrSymbol {
    return typeof item === 'string' || typeof item === 'symbol';
}

/**
 * Determines if the given value is an external resolution config
 * @param item
 */
export function isExternalResolutionConfigurationLike(item: any): item is IExternalResolutionConfiguration {
    return item != null && item.resolver != null && typeof item.resolver === 'function';
}

/**
 * Determines if the given value is an external value resolution config
 * @param item
 */
export function isExternalValueResolutionConfigurationLike(item: any): item is IExternalValueResolutionConfiguration {
    return item != null && item.resolver != null && typeof item.resolver === 'function';
}

/**
 * Determines if a `thing` is injector like in its appearance.
 */
export function isInjectorLike(thing: any): thing is IInjector {
    return (
        thing != null &&
        thing.cache != null &&
        thing.configuration != null &&
        thing.getStrategies != null &&
        thing.registerInstance != null &&
        thing.tokenCache != null &&
        thing.register != null &&
        thing.registerParamForFactoryInjection != null
    );
}

/**
 * Determines if a value is a Boxed value
 */
export function isBoxedValue(thing: any): thing is IBoxedValue {
    return thing != null && thing.typeId === BOXED_TYPE_ID;
}

export function isDestroyable(value: any): value is IDestroyable {
    return (
        value != null &&
        (value as IDestroyable).needle_destroy != null &&
        typeof (value as IDestroyable).needle_destroy === 'function'
    );
}

export function isIdleCacheStrategy(value: any): value is IdleCacheStrategyType {
    return (
        value != null &&
        (value as IdleCacheStrategyType).type === 'idle' &&
        typeof (value as IdleCacheStrategyType).timeout === 'number'
    );
}

export function isConditionalCacheStrategy(value: any): value is ConditionalCacheStrategyType {
    return (
        value != null &&
        (value as ConditionalCacheStrategyType).type === 'conditional' &&
        typeof (value as ConditionalCacheStrategyType).predicate === 'function'
    );
}
