/**
 * IStorage abstraction over key/value storage.
 *
 * The default adapter wraps browser localStorage. Swap it out for tests or
 * Node.js scripts by calling setStorage() from persist.ts.
 *
 *   import { setStorage, MemoryStorageAdapter } from '@fairdrop/sdk/cache';
 *   setStorage(new MemoryStorageAdapter()); // use in-memory for tests / SSR
 */

export interface IStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Wraps browser localStorage. Safe to construct in SSR — operations are no-ops if unavailable. */
export class LocalStorageAdapter implements IStorage {
  private get ls(): Storage | null {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch { return null; }
  }

  getItem(key: string): string | null {
    return this.ls?.getItem(key) ?? null;
  }

  setItem(key: string, value: string): void {
    try { this.ls?.setItem(key, value); } catch { /* quota exceeded */ }
  }

  removeItem(key: string): void {
    try { this.ls?.removeItem(key); } catch { /* ignore */ }
  }
}

/** In-memory storage — for tests and Node.js environments. */
export class MemoryStorageAdapter implements IStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}
