const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function contextMiddleware(req, res, next) {
  storage.run(new Map(), () => next());
}

function set(key, value) {
  const store = storage.getStore();
  if (store) {
    store.set(key, value);
  }
}

function get(key) {
  const store = storage.getStore();
  return store ? store.get(key) : undefined;
}

module.exports = {
  contextMiddleware,
  set,
  get,
};
