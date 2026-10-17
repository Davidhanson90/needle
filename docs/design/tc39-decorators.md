# Design note: standard (TC39) decorators

Status: **spike / prototype** (branch `spike/tc39-decorators`). Not published, not a final API.

## Problem

Needle's decorators (`@Injectable`, `@Inject`, `@Factory`, `@Lazy`, `@Optional`, `@Strategy`, `@Interceptor`) are written for
TypeScript's legacy `experimentalDecorators` + `emitDecoratorMetadata`. Two things in that model do not exist in standard
(stage 3, TS 5.0+ non-experimental) decorators:

1. **Parameter decorators.** `constructor(@Inject('x') a: A)` is not part of the standard. Everything except `@Injectable` and
   `@Interceptor` is a parameter decorator today.
2. **`design:paramtypes`.** Needle reads constructor parameter types from `reflect-metadata` (written by
   `emitDecoratorMetadata`). Standard decorators emit nothing, and TS ignores `emitDecoratorMetadata` when
   `experimentalDecorators` is off. (Decorator `context.metadata` exists in the standard, but it does not carry types.)

Consumers on modern toolchains (Vite/oxc/esbuild defaults, TS 5+ projects, newer Angular alternatives) increasingly cannot or
do not want to turn the legacy flags on.

## Approach

Keep one set of decorator names that works in both modes, and add an explicit, decorator-independent way to describe
constructor dependencies.

### 1. Runtime style detection

A standard decorator is called with `(value, context)` where `context` is an object with a string `kind`. A legacy
parameter decorator is called with `(target, propertyKey | undefined, parameterIndex)`, so its second argument is never an
object. `isStandardContext()` (`main/annotations/decorator-support.ts`) checks exactly that, which is unambiguous.

Programmatic APIs such as `registerParamForTokenInjection` call the decorators with the legacy shape and keep working.

### 2. Constructor injection: `deps`

`IInjectionConfiguration` gets a new `deps` list. It replaces both parameter decorators and `design:paramtypes`:

```ts
import { Injectable, dep } from '@morgan-stanley/needle';

@Injectable({
    deps: [
        Engine,
        dep.token('config'),
        dep.optional(Logger),
        dep.lazy(Wheels),
        dep.factory(Door),
        dep.strategy('handlers'),
    ],
})
class Car {
    constructor(
        engine: Engine,
        config: Config,
        logger: Logger | undefined,
        wheels: LazyInstance<Wheels>,
        doors: AutoFactory<typeof Door>,
        handlers: Handler[],
    ) {}
}
```

- A plain class is a type dependency (what `design:paramtypes` provides today).
- `dep.token(t)` = `@Inject(t)`, `dep.optional(X)` = `@Optional()` (X may be a type or token), `dep.lazy(X)` = `@Lazy(X)`,
  `dep.factory(X)` = `@Factory(X)`, `dep.strategy(s)` = `@Strategy(s)`.
- `Injector.register()` expands `deps` into `metadata` (the existing explicit-metadata mechanism) plus parameter tokens in the
  registering injector's token cache (`main/core/injection/deps.ts`). So the resolution code is unchanged and `deps` also works
  with `injector.register(Type, { deps })` and with no decorators at all.
- If `metadata` is also supplied it wins for the types; `deps` only adds tokens.
- Positions matter, as with constructor parameters. The array is not type-checked against the constructor in this prototype.

### 3. Field and accessor injection

Standard decorators can decorate fields and `accessor`s, so the same decorators accept those:

```ts
@Injectable()
class Car {
    @Inject(Engine) accessor engine!: Engine; // type target
    @Inject('config') accessor config!: Config; // token target
    @Optional(Logger) accessor logger: Logger | undefined;
    @Lazy(Wheels) accessor wheels!: LazyInstance<Wheels>;
    @Factory(Door) accessor doors!: AutoFactory<typeof Door>;
    @Strategy('handlers') accessor handlers!: Handler[];
}
```

- **`accessor` (recommended):** resolved lazily on first read, then stored. Lazy resolution means cyclic references and optional
  dependencies behave better than with constructor injection.
- **plain field:** resolved eagerly during field initialisation (`@Inject(Engine) engine!: Engine`). Note `useDefineForClassFields`
  semantics apply, and `!` fields get `undefined` first, the decorator initialiser replaces it.
- A value from the field initialiser (`accessor x = 'manual'`) wins over injection.
- **Which injector?** `createInstance` now wraps `new type(...)` in `runWithConstructingInjector` (a small stack in
  `main/core/injection/construction-context.ts`). Initialisers read it, so an instance resolved from a scoped injector gets its
  members from that injector. `new Foo()` outside the injector falls back to the root injector.
- `@Inject(Type)` is now accepted in addition to string/symbol tokens. On a **legacy constructor parameter** a type target
  throws a clear error (parameter tokens are string/symbol only).
- `@Optional()` with no argument has no type to look up, so on a field/accessor it must be `@Optional(Target)`; it throws otherwise.
- Static members and methods/getters/setters are rejected with a descriptive error.

### 4. Class decorators

`@Injectable(config)` and `@Interceptor()` now accept (and ignore) the optional context argument, so they are valid standard class
decorators. Nothing else was needed for registration.

### 5. Types

`@Inject`/`@Optional`/`@Lazy`/`@Factory`/`@Strategy` return `IInjectionDecorator`, an overloaded callable type that is valid as a legacy
parameter decorator, a standard accessor decorator, and a standard field decorator. It relies on `ClassAccessorDecoratorTarget`
etc. from TS 5.0's `lib.decorators.d.ts` (the repo uses TS 5.9).

## What was built

| Piece                                         | File                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| style detection + dual-mode decorator factory | `main/annotations/decorator-support.ts`                                              |
| updated decorators                            | `main/annotations/{inject,optional,lazy,factory,strategy,injectable,interceptor}.ts` |
| `deps` + `dep` helpers                        | `main/core/injection/deps.ts`, `contracts.ts` (`deps`, `IDependencyDescriptor`)      |
| constructing-injector context                 | `main/core/injection/construction-context.ts`, `resolution.ts`                       |
| standard-mode tests                           | `spec-standard/standard-decorators.spec.ts` (24 tests)                               |
| `deps` + legacy regression tests              | `main/core/injector.deps.spec.ts`                                                    |

### Test setup

`spec-standard/` is a separate project: its own `tsconfig.json` (`experimentalDecorators: false`, `emitDecoratorMetadata: false`,
type-checked by `npm run test:types`) and `vitest.standard.config.ts` (SWC with `decoratorVersion: '2022-03'`, no `reflect-metadata`).
`npm test` runs the legacy suite and then `npm run test:standard`. One test asserts `Reflect.getMetadata` is undefined and another
asserts constructor params are **not** inferred without `deps`, so the project can't silently fall back to legacy behaviour.

## What works / what doesn't

Works under standard decorators (tested): `@Injectable` (+ tokens, strategy), `deps` for types/tokens/optional/lazy/factory/strategy,
accessor and field injection of type, token, optional, lazy, factory and strategy, scoped-injector resolution, `new` fallback,
`@Interceptor`.

Limitations:

- **No type inference for constructor parameters.** Without `deps` a standard-decorated class resolves with no arguments (explicit
  test). Forgetting `deps` is a silent failure mode. Mitigations: a dev-time warning when `Function.length > deps.length`
  (cheap, partial because default/rest params are not counted) and/or a lint rule.
- **`deps` is positional and not checked against the constructor type** in this spike (see open questions).
- **Parameter decorators don't exist**, so `constructor(@Inject('x') a)` is legacy-only by definition.
- **Field/accessor injection is not available during the constructor body** for plain fields of subclasses until initialisation
  order allows it; `accessor` resolves lazily so is safe, eager fields run at field init, before the constructor body but after
  `super()`.
- **Members are resolved against the injector that constructed the instance**, so objects created manually with `new` use the root
  injector, never a scope.
- No class-member `@Injectable` inheritance semantics were designed: decorated members on a base class are initialised per
  instance by the base class's own decorators (works naturally) but this is untested.
- Interceptors still match on an exact `target` type, unchanged.
- `context.metadata` (decorator metadata proposal) is not used. It could carry per-class tokens without touching the global token cache.
- Not tested against tsc/esbuild/Babel emit of standard decorators; only SWC `2022-03` (TS's own emit and Babel `2023-05+` differ
  slightly in ordering edge cases).

## Migration

Nothing changes for existing legacy users: all 350 pre-existing tests pass unchanged. Legacy decorators remain the default path.

To move a class to standard decorators:

```ts
// before (legacy)
@Injectable()
class Car {
    constructor(
        private engine: Engine,
        @Inject('cfg') private cfg: Config,
        @Optional() private log?: Logger,
    ) {}
}

// after (standard) - option A: deps
@Injectable({ deps: [Engine, dep.token('cfg'), dep.optional(Logger)] })
class Car {
    constructor(
        private engine: Engine,
        private cfg: Config,
        private log?: Logger,
    ) {}
}

// after (standard) - option B: members
@Injectable()
class Car {
    @Inject(Engine) accessor engine!: Engine;
    @Inject('cfg') accessor cfg!: Config;
    @Optional(Logger) accessor log: Logger | undefined;
}
```

`deps` also works with legacy decorators if a team wants to drop `reflect-metadata` before dropping `experimentalDecorators`.

## Risks

- The `Injectable` type signature changed from `(type: T) => void` to `(type: T, _context?) => void`. Source-compatible, but anyone
  wrapping `Injectable()` by hand with a strict function type could notice.
- `@Inject`'s parameter widened (`StringOrSymbol | Newable`) and decorator return types are now `IInjectionDecorator` instead of
  bare functions. Any consumer calling them directly as `(target, undefined, index)` still type-checks.
- Needs TS >= 5.0 for the types (a `peerDependency`/docs note, effectively already true given the repo's TS).
- The constructing-injector stack is synchronous module state; `await` inside a constructor is impossible so this is safe, but a
  constructor that triggers another resolution is handled by the stack.
- Two code paths to maintain and test (legacy + standard) until legacy is dropped.

## Open questions

1. Should `deps` be type-checked against the constructor, e.g. `defineInjectable(Car, [Engine, dep.token<Config>('cfg')])`, or a
   `static inject = [...]` convention (Angular-style), or both? A typed tuple helper keeps a decorator-free route and gets compile-time checking.
2. Add `createToken<T>()` (typed tokens) now so `dep.token(cfgToken)` and `@Inject(cfgToken)` infer `T`? It fits naturally; it was left out of the spike.
3. Should accessor injection be the documented preferred style for standard mode, with `deps` for constructor-style code?
4. Do we want a dev-mode warning for `Function.length` vs `deps.length` mismatches?
5. Use `context.metadata` to carry member injection info instead of per-instance `WeakMap`/stack tricks?
6. Dual publish ESM/CJS interacts with this (unrelated code, but the "which build is the decorator in" question matters for the singleton root injector).

## Recommended next steps

1. Review/approve the API shape (`deps` + `dep.*` + accessor injection) before polishing.
2. Add `createToken<T>()` and make `deps`/`@Inject` accept tokens with inferred types.
3. Add a typed, decorator-free registration helper (`injectable(Car, [...])`) with compile-time arity/type checking.
4. Add the `Function.length` dev warning, docs page, and a docs-site example with a toggle between legacy and standard.
5. Test against TS's native emit (tsc + esbuild) in a CI matrix job alongside SWC, and on TS 5.0-5.9.
6. Decide the major/minor version story (additive, so a minor; new `deps` could stay "experimental" for a release).
