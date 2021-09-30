import type { TRunnable } from './runnables';
import type { InjectableIdentifier } from './typing';

const IsFactory = Symbol('is-factory');

export type FactoryArgs<T> = {
  // identifiers under which the value returned by build will be registered
  ids: InjectableIdentifier[],
  // Extra modules being registered by this factory. They must be declared before the end of the constructor.
  // The value can be a promise if the initialisation is async
  registering?: InjectableIdentifier[],
  build: TRunnable<T>,
};

export type Factory<T> = FactoryArgs<T> & {
  [IsFactory]: true,
};

export function factory<T>(args: FactoryArgs<T>): Factory<T> {

  return {
    ...args,
    [IsFactory]: true,
  };
}

export function isFactory(obj: any): obj is Factory<any> {
  return obj != null && Boolean(obj[IsFactory]);
}
