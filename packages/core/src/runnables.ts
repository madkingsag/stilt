import type { InjectableIdentifier } from './typing';

const IsRunnable = Symbol('is-runnable');

export type RunnableArgs<Return> = {
  run(...deps: any[]): Return,
  dependencies: Array<TRunnable<any> | InjectableIdentifier>,
};

export type TRunnable<Return> = RunnableArgs<Return> & {
  [IsRunnable]: true,
};

export function runnable<Return>(
  run: (...deps: any[]) => Return,
  // dependencies which will be instantiated and passed to run.
  // and runnables to execute before this one
  dependencies?: Array<TRunnable<any> | InjectableIdentifier>,
);

export function runnable<Return>(args: RunnableArgs<Return>);

export function runnable<Return>(
  run: ((...deps: any[]) => Return) | RunnableArgs<Return>,
  dependencies?: Array<TRunnable<any> | InjectableIdentifier>,
): TRunnable<Return> {
  if (run == null) {
    throw new Error('runnable(): first argument is required');
  }

  if (typeof run === 'object') {
    return {
      ...run,
      [IsRunnable]: true,
    };
  }

  return {
    [IsRunnable]: true,
    run,
    dependencies,
  };
}

export function isRunnable(obj: any): obj is TRunnable<any> {
  if (obj == null) {
    return false;
  }

  return obj[IsRunnable] ?? false;
}
