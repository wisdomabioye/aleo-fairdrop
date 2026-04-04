import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from './storage';
import { setStorage, cacheKey, getPersisted, setPersisted, removePersisted, CACHE_VERSION } from './persist';

// Reset to a fresh MemoryStorageAdapter before every test so tests are isolated.
beforeEach(() => {
  setStorage(new MemoryStorageAdapter());
});

describe('MemoryStorageAdapter', () => {
  it('returns null for a missing key',  () => {
    const s = new MemoryStorageAdapter();
    expect(s.getItem('missing')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    const s = new MemoryStorageAdapter();
    s.setItem('key', 'value');
    expect(s.getItem('key')).toBe('value');
  });

  it('removes a stored value', () => {
    const s = new MemoryStorageAdapter();
    s.setItem('key', 'value');
    s.removeItem('key');
    expect(s.getItem('key')).toBeNull();
  });

  it('each instance has independent state', () => {
    const a = new MemoryStorageAdapter();
    const b = new MemoryStorageAdapter();
    a.setItem('x', '1');
    expect(b.getItem('x')).toBeNull();
  });
});

describe('cacheKey', () => {
  it('includes version, namespace and id', () => {
    const k = cacheKey('auction-config', 'abc123');
    expect(k).toBe(`fairdrop:${CACHE_VERSION}:auction-config:abc123`);
  });
});

describe('getPersisted / setPersisted / removePersisted', () => {
  it('returns null for a cache miss', () => {
    expect(getPersisted(cacheKey('ns', 'missing'))).toBeNull();
  });

  it('round-trips a plain object', () => {
    const k = cacheKey('ns', 'obj');
    const data = { foo: 'bar', count: 42 };
    setPersisted(k, data);
    expect(getPersisted<typeof data>(k)).toEqual(data);
  });

  it('round-trips a number', () => {
    const k = cacheKey('ns', 'num');
    setPersisted(k, 99);
    expect(getPersisted<number>(k)).toBe(99);
  });

  it('removePersisted clears the entry', () => {
    const k = cacheKey('ns', 'todelete');
    setPersisted(k, 'hello');
    removePersisted(k);
    expect(getPersisted(k)).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    const s = new MemoryStorageAdapter();
    s.setItem('bad-key', '{not valid json}');
    setStorage(s);
    expect(getPersisted('bad-key')).toBeNull();
  });
});
