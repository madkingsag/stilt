// @flow

export function hasOwnProperty(obj: Object, propertyKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, propertyKey);
}
