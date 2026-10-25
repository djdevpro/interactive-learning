import type { GuideDocument } from '@interactive-learning/protocol';

/** Images live in IndexedDB, not chrome.storage's small JSON quota. */
export class GuideStore {
  private db?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('interactive-learning-guides', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('guides', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  async read(id: string): Promise<GuideDocument | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('guides', 'readonly').objectStore('guides').get(id);
      request.onsuccess = () => resolve(request.result as GuideDocument | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async write(guide: GuideDocument): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('guides', 'readwrite');
      transaction.objectStore('guides').put(guide);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('The write was interrupted.'));
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('guides', 'readwrite');
      transaction.objectStore('guides').delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
