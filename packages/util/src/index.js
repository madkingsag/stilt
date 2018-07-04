// @flow

export function hasOwnProperty(obj: Object, propertyKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, propertyKey);
}

export function isPlainObject(obj: Object) {
  const proto = Object.getPrototypeOf(obj);

  return proto == null || proto === Object.prototype;
}
