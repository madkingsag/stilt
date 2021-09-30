export const IsLazy = Symbol('is-lazy');

export type TLazy<T> = {
  (): T,
  [IsLazy]: true,
};

export type TOptionalLazy<T> = TLazy<T> | T;

export function lazy<T>(callback: () => T): TLazy<T> {
  callback[IsLazy] = true;

  // @ts-expect-error
  return callback;
}

export function isLazy(item: any): item is TLazy<any> {
  return typeof item === 'function' && item[IsLazy];
}
