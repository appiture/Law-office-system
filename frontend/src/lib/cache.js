const memoryCache = new Map();

const now = () => Date.now();

const readStore = () => {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return window.sessionStorage;
};

export const getCache = (key) => {
  const cacheKey = String(key || "");
  if (!cacheKey) return null;

  const memoryEntry = memoryCache.get(cacheKey);
  if (memoryEntry && memoryEntry.expiresAt > now()) return memoryEntry.value;
  if (memoryEntry) memoryCache.delete(cacheKey);

  const store = readStore();
  if (!store) return null;

  try {
    const raw = store.getItem(`cache:${cacheKey}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry?.expiresAt || entry.expiresAt <= now()) {
      store.removeItem(`cache:${cacheKey}`);
      return null;
    }
    memoryCache.set(cacheKey, entry);
    return entry.value;
  } catch {
    store.removeItem(`cache:${cacheKey}`);
    return null;
  }
};

export const setCache = (key, value, ttlMs = 60_000) => {
  const cacheKey = String(key || "");
  if (!cacheKey) return;

  const entry = {
    value,
    expiresAt: now() + Math.max(0, Number(ttlMs) || 0),
  };
  memoryCache.set(cacheKey, entry);

  const store = readStore();
  if (!store) return;

  try {
    store.setItem(`cache:${cacheKey}`, JSON.stringify(entry));
  } catch {
    memoryCache.set(cacheKey, entry);
  }
};

export const clearCache = (prefix = "") => {
  const normalizedPrefix = String(prefix || "");
  for (const key of memoryCache.keys()) {
    if (!normalizedPrefix || key.startsWith(normalizedPrefix)) {
      memoryCache.delete(key);
    }
  }

  const store = readStore();
  if (!store) return;

  for (let index = store.length - 1; index >= 0; index -= 1) {
    const storageKey = store.key(index);
    if (!storageKey?.startsWith("cache:")) continue;
    const appKey = storageKey.slice("cache:".length);
    if (!normalizedPrefix || appKey.startsWith(normalizedPrefix)) {
      store.removeItem(storageKey);
    }
  }
};
