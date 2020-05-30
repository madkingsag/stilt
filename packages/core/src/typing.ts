export type Class<T> = new (...args: any[]) => T;

export type InjectableIdentifier = Class<any> | string | symbol;

