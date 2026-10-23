import { openDB } from 'idb';

const DB_NAME = 'SalesTerpaduDB';
const DB_VERSION = 1;

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('orderQueue')) {
        db.createObjectStore('orderQueue', { keyPath: 'client_key' });
      }
    }
  });
}

export async function cacheCustomers(customers) {
  const db = await initDB();
  const tx = db.transaction('customers', 'readwrite');
  await tx.store.clear();
  for (const c of customers) {
    if (c && c.id) {
      // Hilangkan Proxy / non-cloneable properties
      const plainObj = JSON.parse(JSON.stringify(c));
      await tx.store.put(plainObj);
    }
  }
  await tx.done;
}

export async function getCachedCustomers() {
  const db = await initDB();
  return db.getAll('customers');
}

export async function cacheProducts(products) {
  const db = await initDB();
  const tx = db.transaction('products', 'readwrite');
  await tx.store.clear();
  for (const p of products) {
    if (p && p.id) {
      // Hilangkan Proxy / non-cloneable properties
      const plainObj = JSON.parse(JSON.stringify(p));
      await tx.store.put(plainObj);
    }
  }
  await tx.done;
}

export async function getCachedProducts() {
  const db = await initDB();
  return db.getAll('products');
}

export async function queueOfflineOrder(order) {
  const db = await initDB();
  const plainOrder = JSON.parse(JSON.stringify(order));
  return db.put('orderQueue', {
    ...plainOrder,
    status: 'Menunggu kirim',
    created_at: new Date().toISOString()
  });
}

export async function getOfflineOrders() {
  const db = await initDB();
  return db.getAll('orderQueue');
}

export async function removeOfflineOrder(clientKey) {
  const db = await initDB();
  return db.delete('orderQueue', clientKey);
}
