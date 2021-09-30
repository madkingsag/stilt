import assert from 'assert';
import pathUtil from 'path';
import glob from 'glob';

export function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  propertyKey: Y,
): obj is X & Record<Y, unknown> {

  return Object.prototype.hasOwnProperty.call(obj, propertyKey);
}

export function isPlainObject(obj: any): obj is Object {
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

export async function awaitAllEntries<T extends { [key: string]: any },
  >(obj: T): Promise<{ [P in keyof T]: UnwrapPromise<T[P]> }> {

  const values = await Promise.all(Object.values(obj));
  const keys = Object.keys(obj);

  const resolvedObject = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    resolvedObject[key] = values[i];
  }

  return resolvedObject;
}

export function mapObject<In, Out, T extends { [key: string]: In }>(
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

export function assertIsFunction(item: any): asserts item is Function {
  assert(typeof item === 'function');
}
