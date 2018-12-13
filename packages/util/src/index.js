// @flow

import assert from 'assert';
import pathUtil from 'path';
import glob from 'glob';

export function hasOwnProperty(obj: Object, propertyKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, propertyKey);
}

export function isPlainObject(obj: Object) {
  const proto = Object.getPrototypeOf(obj);

  return proto == null || proto === Object.prototype;
}

export function asyncGlob(path: string, options: Object = {}): Promise<string[]> {
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

export function coalesce(...args) {
  assert(args.length > 0, 'Must have at least one argument');

  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (arg != null) {
      return arg;
    }
  }

  return args[args.length - 1];
}

export async function awaitAllEntries(obj: Object): Object {

  const values = await Promise.all(Object.values(obj));
  const keys = Object.keys(obj);

  const resolvedObject = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    resolvedObject[key] = values[i];
  }

  return resolvedObject;
}

export function mapObject(
  obj: Object,
  callback: (value: any, key: string) => any,
): Object {

  const keys = Object.keys(obj);
  const newObject = Object.create(null);
  for (const key of keys) {

    newObject[key] = callback(obj[key], key);
  }

  return newObject;
}
