# Standard decorators, typed tokens and `injectable()`

> **Status: prototype** (branch `spike/tc39-decorators`). See the [design note](design/tc39-decorators.md) for the reasoning and open questions.

Needle's decorators were written for TypeScript's legacy `experimentalDecorators` with `emitDecoratorMetadata`. Standard (TC39, TypeScript 5+) decorators have **no parameter decorators** and **emit no constructor metadata**, so constructor injection needs a different description of the constructor. This page covers the three pieces that make Needle work without the legacy flags:

1. [`deps`](#describing-the-constructor-with-deps) - say what the constructor takes
2. [`createToken<T>()`](#typed-tokens) - tokens that carry their type
3. [`injectable()`](#injectable-decorator-free-and-type-checked) - register a class with `deps` checked against the constructor

## Setup

No `reflect-metadata`, no `experimentalDecorators`, no `emitDecoratorMetadata`:

```json
{ "compilerOptions": { "target": "ES2022", "experimentalDecorators": false, "emitDecoratorMetadata": false } }
```

Tested toolchains: `tsc` (TypeScript 5.0 to 5.9 native emit), esbuild and SWC (`decoratorVersion: '2022-03'`).

## Describing the constructor with `deps`

```typescript
import { Injectable, dep } from '@morgan-stanley/needle';

@Injectable({
    deps: [Engine, dep.token('config'), dep.optional(Logger), dep.lazy(Wheels)],
})
class Car {
    constructor(engine: Engine, config: Config, logger: Logger | undefined, wheels: LazyInstance<Wheels>) {}
}
```

A class is a type dependency. `dep.token`, `dep.optional`, `dep.lazy`, `dep.factory` and `dep.strategy` map to `@Inject`, `@Optional`, `@Lazy`, `@Factory` and `@Strategy`.

### Dev-mode warning

A standard-decorated class that forgets `deps` would be constructed with `undefined` arguments. In development, Needle warns through the [pluggable logger](errors-and-logging.md) when:

- the constructor declares parameters but there are no `deps` (and no `metadata`), or
- `deps.length` differs from the constructor's `Function.length`.

The warning is not emitted when `NODE_ENV` is `production`, nor for legacy decorator usage. `Function.length` stops at the first parameter with a default value or a rest parameter, so a longer `deps` list can be a false alarm for those constructors.

## Typed tokens

```typescript
import { createToken, get } from '@morgan-stanley/needle';

interface AppConfig {
    url: string;
}

export const Config = createToken<AppConfig>('config');

getRootInjector().registerValue({ tokens: [Config], value: { url: '/api' } });

const config = get(Config); // AppConfig
const maybe = getRootInjector().getOptional(Config); // AppConfig | undefined
const lazy = getRootInjector().getLazy(Config); // LazyInstance<AppConfig>
```

At runtime a token is a unique `symbol`, so it works everywhere a symbol token does: `@Inject(Config)`, `tokens: [Config]`, `deps: [Config]`, `dep.token(Config)`. The type is only used to infer what `get`, `getOptional` and `getLazy` return and what `injectable()` accepts.

Note `registerValue` and `@Inject(token) accessor x` do not yet check the value or member type against the token.

## `injectable()`: decorator-free and type-checked

```typescript
import { injectable, createToken, dep } from '@morgan-stanley/needle';

class Car {
    constructor(
        readonly engine: Engine,
        readonly config: AppConfig,
        readonly logger: Logger | undefined,
    ) {}
}

injectable(Car, [Engine, Config, dep.optional(Logger)]);
```

The `deps` tuple is checked against `ConstructorParameters<typeof Car>`, one entry per parameter:

```typescript
injectable(Car, [Engine]); // error: missing entries
injectable(Car, [Wheels, Config, dep.optional(Logger)]); // error: Wheels is not an Engine
injectable(Car, [Engine, createToken<number>(), dep.optional(Logger)]); // error: wrong token type
injectable(Car, [Engine, Config, Logger]); // error: parameter is `Logger | undefined`, use dep.optional
```

Each entry is a class (or subclass), a typed token or a `dep.*` helper: `dep.optional(X)` provides `X | undefined`, `dep.lazy(X)` provides `LazyInstance<X>`, `dep.factory(X)` provides `AutoFactory<typeof X>`. String tokens (`dep.token('name')`, `dep.strategy('name')`) cannot be checked and match any parameter.

Because TypeScript types are structural, a class whose shape equals the expected one is accepted. `injectable()` works with legacy decorators, standard decorators or none, and does not need any compiler flags.

## Members instead of constructor parameters

Fields and `accessor`s can be decorated directly (standard decorators only):

```typescript
@Injectable()
class Car {
    @Inject(Engine) accessor engine!: Engine;
    @Inject(Config) accessor config!: AppConfig;
    @Optional(Logger) accessor logger: Logger | undefined;
}
```

## Testing the toolchains

```bash
npm run test:standard                 # SWC
node scripts/test-standard-native.mjs tsc       # tsc native emit
npm install --no-save esbuild@^0.27   # esbuild is not a dependency of the repo
node scripts/test-standard-native.mjs esbuild   # esbuild native emit
```

The `Standard decorators` workflow runs all three, plus `tsc` on every TypeScript release from 5.0 to 5.9.
