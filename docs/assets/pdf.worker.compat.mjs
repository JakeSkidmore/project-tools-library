if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  };
}
if (typeof Promise.try !== 'function') {
  Promise.try = function promiseTry(callback, ...argumentsValue) {
    return new Promise(resolve => resolve(callback(...argumentsValue)));
  };
}
if (typeof URL.parse !== 'function') {
  URL.parse = function parseUrl(url, base) {
    try { return new URL(url, base); } catch { return null; }
  };
}
if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    configurable: true,
    writable: true,
    value(predicate, thisArgument) {
      for (let index = this.length - 1; index >= 0; index--) {
        if (predicate.call(thisArgument, this[index], index, this)) return this[index];
      }
      return undefined;
    },
  });
}

await import('./pdf.worker.min.mjs');
