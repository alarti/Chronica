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

export function createNewStory(title, plot, gameState) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORIES_STORE], 'readwrite');
    const store = transaction.objectStore(STORIES_STORE);
    const newStory = {
        title: title,
        plot: plot,
        gameState: gameState,
        last_played: new Date()
    };
    const request = store.add(newStory);
    request.onsuccess = () => resolve(request.result); // Returns the new ID
    request.onerror = (event) => reject(event.target.error);
  });
}

export function updateStory(storyId, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORIES_STORE], 'readwrite');
        const store = transaction.objectStore(STORIES_STORE);
        const request = store.get(storyId);

        request.onsuccess = () => {
            const story = request.result;
            if (story) {
                // Update the fields
                Object.assign(story, data);
                story.last_played = new Date();
                const updateRequest = store.put(story);
                updateRequest.onsuccess = () => resolve(updateRequest.result);
                updateRequest.onerror = (event) => reject(event.target.error);
            } else {
                reject(new Error(`Story with id ${storyId} not found`));
            }
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

export function getStory(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORIES_STORE], 'readonly');
        const store = transaction.objectStore(STORIES_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

export function deleteStory(storyId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORIES_STORE, EVENTS_STORE], 'readwrite');
        const storiesStore = transaction.objectStore(STORIES_STORE);
        const eventsStore = transaction.objectStore(EVENTS_STORE);

        // 1. Delete the story itself
        storiesStore.delete(storyId);

        // 2. Delete all associated events
        const eventsIndex = eventsStore.index('story_id_idx');
        const eventsRequest = eventsIndex.openCursor(IDBKeyRange.only(storyId));

        eventsRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => {
            console.log(`Story ${storyId} and all its events have been deleted.`);
            resolve();
        };

        transaction.onerror = (event) => {
            console.error(`Error deleting story ${storyId}:`, event.target.error);
            reject(event.target.error);
        };
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
