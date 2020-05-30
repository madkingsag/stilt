import EventEmitter from 'events';

export class AsyncEventEmitter extends EventEmitter {
  async emit(type, ...args) {
    const handlers = this._events[type];
    const isArray = Array.isArray(handlers);
    if (!isArray && typeof handlers !== 'function') {
      return false;
    }

    if (!isArray) {
      await handlers(...args);

      return true;
    }

    const promises = [];

    for (const handler of [...handlers]) {
      promises.push(handler(...args));
    }

    await Promise.all(promises);

    return true;
  }
}
