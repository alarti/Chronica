const DB_NAME = 'ChronicaDB';
const DB_VERSION = 1;
const STORE_NAME = 'events';

let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB initialized successfully.');
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.errorCode);
      reject(event.target.error);
    };
  });
}

export function saveEvent(eventData) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject('DB is not initialized.');
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(eventData);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

export function getHistory(limit = 5) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject('DB is not initialized.');
    }
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const allEvents = [];

    // This is complex with raw IndexedDB. We get all and slice.
    // A real implementation might use cursors differently or an index.
    const request = store.getAll();

    request.onsuccess = () => {
      const sortedEvents = request.result.reverse();
      resolve(sortedEvents.slice(0, limit));
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}
