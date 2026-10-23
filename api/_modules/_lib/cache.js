const cacheStore = new Map();

/**
 * Menyimpan data tab dengan TTL 120 detik (2 menit) untuk respon secepat kilat
 */
export function getCached(key) {
  const item = cacheStore.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return item.value;
}

export function setCached(key, value, ttlSeconds = 120) {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
}

export function clearCache(tabName) {
  if (tabName) {
    for (const key of cacheStore.keys()) {
      if (key.startsWith(tabName)) {
        cacheStore.delete(key);
      }
    }
  } else {
    cacheStore.clear();
  }
}
