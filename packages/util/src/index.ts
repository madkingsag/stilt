import assert from 'assert';
import pathUtil from 'path';
import glob from 'glob';

export function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  propertyKey: Y,
): obj is X & Record<Y, unknown> {

  return Object.prototype.hasOwnProperty.call(obj, propertyKey);
}

export function isPlainObject(obj: any): obj is object {
  const proto = Object.getPrototypeOf(obj);

  return proto == null || proto === Object.prototype;
}

export async function asyncGlob(path: string, options: Object = {}): Promise<string[]> {
  return new Promise((resolve, reject) => {

    const newOptions = {
      cwd: asyncGlob.cwd,
      ...options,
    };

    glob(path, newOptions, (err, files) => {
      if (err) {
        return void reject(err);
      }

      // make files paths absolute
      files = files.map(file => pathUtil.join(asyncGlob.cwd || '', file));

      resolve(files);
    });
  });
}

asyncGlob.cwd = null;

/**
 * @returns the first non-nullish argument
 */
export function coalesce<T>(...args: T[]): T {
  assert(args.length > 0, 'Must have at least one argument');

  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (arg != null) {
      return arg;
    }
  }

  return args[args.length - 1];
}

type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
export type MaybePromise<T> = Promise<T> | T;

// eslint-disable-next-line max-len
export async function awaitAllEntries<In, T extends { [key: string]: MaybePromise<In> }>(obj: T): Promise<{ [P in keyof T]: UnwrapPromise<T[P]> }>;
export async function awaitAllEntries<In>(obj: Array<MaybePromise<In>>): Promise<In[]>;
// eslint-disable-next-line max-len
export async function awaitAllEntries<In, T extends ({ [key: string]: MaybePromise<In> })>(obj: T | Array<MaybePromise<In>>): Promise<{ [P in keyof T]: UnwrapPromise<T[P]> } | In[]> {
  if (Array.isArray(obj)) {
    return Promise.all(obj);
  }

  const values = await Promise.all(Object.values(obj));
  const keys = Object.keys(obj);

  const resolvedObject = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    resolvedObject[key] = values[i];
  }

  return resolvedObject;
}

export function mapObject<In, Out, T>(
  obj: T,
  callback: (value: In, key: string) => Out,
): { [P in keyof T]: Out } {

  const keys = Object.keys(obj);
  const newObject = Object.create(null);
  for (const key of keys) {

    newObject[key] = callback(obj[key], key);
  }

  return newObject;
}

export function mapEntries<In, Out, T extends { [key: string]: In }>(
  obj: T,
  callback: (value: In, key: string | number) => Out
): { [P in keyof T]: Out };

export function mapEntries<In, Out>(
  obj: In[],
  callback: (value: In, key: string | number) => Out
): Out[];

export function mapEntries<In, Out, T extends ({ [key: string]: In })>(
  obj: T | In[],
  callback: (value: In, key: string | number) => Out): { [P in keyof T]: Out } | Out[] {
  // process.env.JEST_WORKER_ID
  if (Array.isArray(obj)) {
    return obj.map((value, key) => callback(value, key));
  }

  return mapObject(obj, callback);
}

// eslint-disable-next-line max-len
export async function awaitMapAllEntries<In, Out, T extends { [key: string]: In }>(obj: T, callback: (value: In, key: string | number) => MaybePromise<Out>, sequential?: boolean): Promise<{ [P in keyof T]: Out }>;
// eslint-disable-next-line max-len
export async function awaitMapAllEntries<In, Out>(obj: In[], callback: (value: In, key: string | number) => MaybePromise<Out>, sequential?: boolean): Promise<Out[]>;
// eslint-disable-next-line max-len
export async function awaitMapAllEntries<In, Out, T extends ({ [key: string]: In })>(
  obj: T | In[],
  callback: (value: In, key: string | number) => MaybePromise<Out>,
  sequential?: boolean): Promise<{ [P in keyof T]: Out } | Out[]> {

  // `sequential` option is a workaround due to a bug when using Jest with native ES Modules
  // See https://github.com/facebook/jest/issues/11434
  if (sequential) {
    if (Array.isArray(obj)) {
      const out = [];

      for (let i = 0; i < obj.length; i++){
        // eslint-disable-next-line no-await-in-loop
        out.push(await callback(obj[i], i));
      }

      return out;
    }

    const out = {};
    for (const key of Object.keys(obj)) {
      // eslint-disable-next-line no-await-in-loop
      out[key] = await callback(obj[key], key);
    }

    // @ts-expect-error
    return out;
  }

  // @ts-expect-error
  const mapped = mapEntries(obj, callback);
  const out = awaitAllEntries(mapped);

  // @ts-expect-error
  return out;
}

export function assertIsFunction(item: any): asserts item is Function {
  assert(typeof item === 'function');
}

export const FORCE_SEQUENTIAL_MODULE_IMPORT = process.env.JEST_WORKER_ID != null;

type TResolve<T> = (value: T | PromiseLike<T>) => void;
type TReject = (reason?: any) => void;

export type TDeferred<T> = { promise: Promise<T>, resolve: TResolve<T>, reject: TReject };

export function createDeferred<T>(): TDeferred<T> {
  let resolve: TResolve<T>;
  let reject: TReject;

  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return { promise, resolve, reject };
}

export function getValueName(value: any): string {
  if (typeof value !== 'object' || value === null) {
    return String(value);
  }

  return value.name || value.constructor.name;
}

export function getMethodName(classOrInstance: Object, key: symbol | string): string {
  if (classOrInstance.constructor) {
    // instance
    return `${getValueName(classOrInstance)}#${String(key)}`;
  }

  // static
  return `${getValueName(classOrInstance)}.${String(key)}`;
}
