const store = new Map<string, string>();

const storage: Storage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  key(index: number) {
    return [...store.keys()][index] ?? null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
};

// Node's experimental webstorage global can be a broken stub when the
// --localstorage-file path is invalid, so tests get a working in-memory shim.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}
try {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
} catch {
  // non-configurable global binding; window.localStorage is enough
}

// jsdom lacks matchMedia, which next-themes requires.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
