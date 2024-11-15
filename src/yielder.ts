export type OptionSome<T> = { i: 1; value: T; unwrap: () => T };
export type OptionNone = { i: 0; unwrap: () => never };
export type Option<T> = OptionSome<T> | OptionNone;

export type ResultError<TErr extends Error> = {
  i: 0;
  error: TErr;
  unwrap: () => never;
};
export type ResultOk<TVal> = { i: 1; value: TVal; unwrap: () => TVal };
export type Result<TVal, TErr extends Error> =
  | ResultOk<TVal>
  | ResultError<TErr>;

export namespace Enums {
  export const Option = (() => {
    const some_tag = Symbol("Option::Some");
    const none_tag = Symbol("Option::None");
    const OptSome = function <T>(value: T) {
      return {
        tag: some_tag,
        i: 1,
        value,
        unwrap: () => value,
      } as Option<T>;
    };
    const OptNone = function () {
      return {
        tag: none_tag,
        i: 0,
        unwrap(): never {
          throw new Error("Attempting to unwrap Option.None");
        },
      } as OptionNone;
    };
    function is_some<T = unknown>(val: any): val is OptionSome<T> {
      if (!is_obj(val)) return false;
      return "tag" in val && val.tag == some_tag;
    }
    return Object.freeze({
      Some: OptSome,
      get None() {
        return OptNone();
      },
      is_some,
    });
  })();

  export const Result = (() => {
    const er_tag = Symbol("Result::Error");
    const ok_tag = Symbol("Result::Ok");
    function ResErr<TErr extends Error>(error: TErr) {
      const res = Object.create(null) as any;
      Object.defineProperties(res, {
        tag: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: er_tag,
        },
        i: {
          configurable: false,
          enumerable: true,
          writable: false,
          value: 0,
        },
        error: {
          configurable: false,
          enumerable: true,
          writable: false,
          value: error,
        },
        toString: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => {
            return `Result::Error(${error})`;
          },
        },
        unwrap: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => {
            throw new Error("Attempting to unwrap Result.Error");
          },
        },
      });
      return res as ResultError<TErr>;
    }

    function ResOk<TVal>(val: TVal) {
      const res = Object.create(null) as any;
      Object.defineProperties(res, {
        tag: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: ok_tag,
        },
        i: {
          configurable: false,
          enumerable: true,
          writable: false,
          value: 1,
        },
        value: {
          configurable: false,
          enumerable: true,
          writable: false,
          value: val,
        },
        toString: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => {
            return `Result::Ok(${val})`;
          },
        },
        unwrap: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => {
            return val;
          },
        },
      });
      return res as ResultOk<TVal>;
    }

    function is_err<
      TVal,
      TErr extends Error,
      T extends Result<TVal, TErr> = Result<TVal, TErr>,
      // @ts-ignore Trust me bro
    >(res: T): res is ResultError<TErr> {
      if (!is_obj(res)) return false;
      // @ts-ignore tag is not an exposed property of the result
      return "tag" in res && res.tag == er_tag;
    }
    function is_ok<
      TVal,
      TErr extends Error,
      T extends Result<TVal, TErr> = Result<TVal, TErr>,
    >(
      res: T,
      // @ts-ignore Trust me bro
    ): res is ResultOk<TVal> {
      if (!is_obj(res)) return false;
      // @ts-ignore tag is not an exposed property of the result
      return "tag" in res && res.tag == ok_tag;
    }
    function unwrap<
      TVal,
      TErr extends Error,
      T extends Result<TVal, TErr> = Result<TVal, TErr>,
    >(res: T): TVal {
      if (is_err(res)) {
        throw new Error("Attempting to unwrap Enum.Result.Error");
      }
      return res.value;
    }

    return Object.freeze({
      Err: ResErr,
      Ok: ResOk,
      is_err,
      is_ok,
      unwrap,
    });
  })();

  export function create<
    const TName extends string,
    const TKey extends string,
    const TKeys extends { [k: number]: TKey } & { length: number },
  >(
    name: TName,
    // @ts-expect-error Trust me bro
    ...keys: TKeys
  ): {
    // @ts-ignore Trust me bro
    readonly [Key in keyof TKeys as TKeys[Key]]: Key extends string
      ? Key extends `${infer Idx extends number}`
        ? Idx
        : never
      : never;
  } & {
    readonly count: () => number;
    readonly keys: () => TKeys;
    readonly values: () => (keyof TKeys extends infer Key
      ? Key extends `${infer I extends number}`
        ? I
        : never
      : never)[];
    readonly entries: () => (keyof TKeys extends infer Key
      ? Key extends `${infer I extends number}`
        ? // @ts-ignore "It works" - Source: trust me bro
          [TKeys[Key], I]
        : never
      : never)[];
    readonly nameOf: (val: number) => Option<TKey>;
  } {
    const en = {} as any; // "It's fine" - Source: trust me bro
    Object.defineProperties(en, {
      toString: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => `Enum(${name})`,
      },
      count: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => keys.length,
      },
      keys: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => [...(keys as any)],
      },
      values: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => Array.from({ length: keys.length }).map((_v, i) => i),
      },
      entries: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: () => (keys as any as TKey[]).map((val, idx) => [val, idx]),
      },
      nameOf: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: (val: number) =>
          val in keys ? Option.Some(keys[val]) : Option.None,
      },
    });
    for (let i = 0; i < keys.length; ++i) {
      en[keys[i]] = {
        [Symbol.toPrimitive](hint: "string" | "number" | (string & {})) {
          if (hint == "string") {
            return keys[i];
          }
          return i;
        },
        value: i,
        name: keys[i],
      };
    }
    return en;
  }
}

export namespace Lists {
  export function map<T, U>(fn: (value: T, index: number) => U) {
    return (array: Array<T>) => array.map(fn);
  }

  export function filter<T>(fn: (value: T, index: number) => boolean) {
    return (array: Array<T>) => array.filter(fn);
  }

  export function filter_map<T, U>(fn: (value: T, index: number) => Option<U>) {
    return (array: Array<T>) => {
      let mapped: U[] = [];
      for (let i = 0; i < array.length; ++i) {
        const item = array[i];
        const option = fn(item, i);
        if (Enums.Option.is_some(option)) {
          mapped.push(option.unwrap());
        }
      }
      return mapped;
    };
  }

  export function sum(arr: Array<number>): number;
  export function sum(): (arr: Array<number>) => number;
  export function sum(arr?: Array<number>) {
    if (arr) {
      return arr.reduce((prev, cur) => prev + cur, 0);
    }
    return (array: Array<number>) => array.reduce((prev, cur) => prev + cur, 0);
  }
}

function is_fn<T extends Function = Function>(value: unknown): value is T {
  return typeof value == "function";
}
function is_obj<T extends object>(value: unknown): value is T {
  return typeof value == "object" && value != null;
}

function isIteratorLike(value: unknown): value is Iterator<unknown> {
  if (!is_obj(value)) return false;
  if (!("next" in value)) return false;
  return is_fn(value.next);
}

export function time_log(...args: any[]) {
  console.log(`[${new Date().toLocaleTimeString()}]:`, ...args);
}
export function sleep(sec: number) {
  return new Promise((res) => setTimeout(res, sec * 1000));
}

type Runnable<T> =
  | (() => Generator<unknown, T>)
  | Generator<unknown, T>
  | (() => Iterator<unknown>)
  | Iterator<unknown>;
type ItStep = { done: boolean; value: any };

function run_step(
  g: Iterator<unknown>,
  given_value?: any,
): ItStep | Promise<ItStep> {
  let step = typeof given_value != "undefined" ? g.next(given_value) : g.next();
  let v = step.value;
  if (v instanceof Promise) {
    return v.then((x) => ({ done: step.done, value: x }) as ItStep);
  }
  return step as ItStep;
}
type FetchArgs = typeof fetch extends (...args: infer T) => any ? T : never;
export function net(...args: FetchArgs): Generator<Response, Response> {
  return fetch(...args) as any;
}

export async function run<T>(f: Runnable<T>): Promise<T> {
  let gen = typeof f == "function" ? f() : f;
  if (!isIteratorLike(gen)) {
    console.error("Expected Generator or a function that returns a Generator");
    // throw new Error("Expected Generator or a function that returns a Generator");
    // @ts-ignore
    return undefined;
  }
  let step = run_step(gen);
  while (true) {
    if (step instanceof Promise) {
      step = await step;
      continue;
    }
    if (isIteratorLike(step.value)) {
      step.value = await run(step.value as Runnable<any>);
      continue;
    }
    if (step.done) {
      break;
    }
    step = run_step(gen, step.value);
  }
  return step.value;
}

export function* unwrap<T>(promise: Promise<T>): Generator<unknown, T, T> {
  const r = yield promise as any;
  return r;
}

type Unwrap<T> = T extends (...args: any) => Promise<infer U>
  ? Unwrap<U>
  : T extends (...args: any) => infer U
    ? Unwrap<U>
    : T extends Promise<infer U>
      ? Unwrap<U>
      : T extends Generator<any, infer U>
        ? Unwrap<U>
        : T;

type PipeTo<X, Y> = (x: Unwrap<X>) => Y;

export function pipe<A, B>(
  a: A,
  ab: PipeTo<A, B>,
): Generator<unknown, Unwrap<B>>;
export function pipe<A, B, C>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
): Generator<unknown, Unwrap<C>>;
export function pipe<A, B, C, D>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
): Generator<unknown, Unwrap<D>>;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
): Generator<unknown, Unwrap<E>>;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
  ef: PipeTo<E, F>,
): Generator<unknown, Unwrap<F>>;
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
  ef: PipeTo<E, F>,
  fg: PipeTo<F, G>,
): Generator<unknown, Unwrap<G>>;
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
  ef: PipeTo<E, F>,
  fg: PipeTo<F, G>,
  gh: PipeTo<G, H>,
): Generator<unknown, Unwrap<H>>;
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
  ef: PipeTo<E, F>,
  fg: PipeTo<F, G>,
  gh: PipeTo<G, H>,
  hi: PipeTo<H, I>,
): Generator<unknown, Unwrap<I>>;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  a: A,
  ab: PipeTo<A, B>,
  bc: PipeTo<B, C>,
  cd: PipeTo<C, D>,
  de: PipeTo<D, E>,
  ef: PipeTo<E, F>,
  fg: PipeTo<F, G>,
  gh: PipeTo<G, H>,
  hi: PipeTo<H, I>,
  ij: PipeTo<I, J>,
): Generator<unknown, Unwrap<J>>;
export function* pipe(
  a: any,
  ...pipers: Array<(x: any) => any>
): Generator<any, any> {
  let x = yield typeof a == "function" ? a() : a;
  pipers.reverse();
  let f: ((x: any) => any) | undefined = pipers.pop();
  while (f != null) {
    x = f(x);
    if (isIteratorLike(x)) {
      // @ts-ignore
      x = yield* x;
    } else {
      x = yield x;
    }
    f = pipers.pop();
  }
  return x;
}
