const DB_NAME = 'ChronicaDB';
const DB_VERSION = 2; // Increment version to trigger onupgradeneeded
const STORIES_STORE = 'stories';
const EVENTS_STORE = 'events';

let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORIES_STORE)) {
        dbInstance.createObjectStore(STORIES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!dbInstance.objectStoreNames.contains(EVENTS_STORE)) {
        const eventsStore = dbInstance.createObjectStore(EVENTS_STORE, { autoIncrement: true });
        eventsStore.createIndex('story_id_idx', 'story_id', { unique: false });
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

export function createNewStory(title) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORIES_STORE], 'readwrite');
    const store = transaction.objectStore(STORIES_STORE);
    const newStory = { title: title, last_played: new Date() };
    const request = store.add(newStory);
    request.onsuccess = () => resolve(request.result); // Returns the new ID
    request.onerror = (event) => reject(event.target.error);
  });
}

export function getAllStories() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORIES_STORE], 'readonly');
    const store = transaction.objectStore(STORIES_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export function saveEvent(storyId, eventData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([EVENTS_STORE], 'readwrite');
    const store = transaction.objectStore(EVENTS_STORE);
    const request = store.add({ ...eventData, story_id: storyId });
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export function getHistory(storyId, limit = Infinity) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([EVENTS_STORE], 'readonly');
    const store = transaction.objectStore(EVENTS_STORE);
    const index = store.index('story_id_idx');
    const request = index.getAll(storyId);

    request.onsuccess = () => {
      const sortedEvents = request.result.reverse();
      resolve(sortedEvents.slice(0, limit));
    };
    request.onerror = (event) => reject(event.target.error);
  });
}
