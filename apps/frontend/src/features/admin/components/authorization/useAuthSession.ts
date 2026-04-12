import { useState, useCallback, useMemo, useRef } from 'react';
import { generateNonce } from '@fairdrop/sdk/hash';
import { EMPTY_SIGS, type ThreeSigs } from '../../types';
import type { UtilityKey } from '../../hooks/useCallerStatus';

interface NonceEntry {
  opNonce:   bigint;
  requestId: bigint;
}

export interface AuthSession {
  nonces:  Record<string, NonceEntry>;
  sigs:    Record<string, ThreeSigs>;
  setSigs: (key: UtilityKey, value: ThreeSigs) => void;
  clear:   () => void;
}

interface StoredSession {
  nonces: Record<string, { opNonce: string; requestId: string }>;
  sigs:   Record<string, ThreeSigs>;
}

function storageKey(auctionAddress: string): string {
  return `fairdrop:auth-session:${auctionAddress}`;
}

function loadSession(auctionAddress: string, missingKeys: UtilityKey[]): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(storageKey(auctionAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    const allPresent = missingKeys.every((k) => parsed.nonces[k]);
    return allPresent ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(auctionAddress: string, session: StoredSession): void {
  try {
    sessionStorage.setItem(storageKey(auctionAddress), JSON.stringify(session));
  } catch { /* quota — ignore */ }
}

function createFreshSession(missingKeys: UtilityKey[]): StoredSession {
  const nonces: StoredSession['nonces'] = {};
  const sigs:   StoredSession['sigs']   = {};
  for (const key of missingKeys) {
    nonces[key] = {
      opNonce:   generateNonce().toString(),
      requestId: generateNonce().toString(),
    };
    sigs[key] = [...EMPTY_SIGS] as ThreeSigs;
  }
  return { nonces, sigs };
}

function toBigIntNonces(stored: StoredSession['nonces']): Record<string, NonceEntry> {
  const result: Record<string, NonceEntry> = {};
  for (const [k, v] of Object.entries(stored)) {
    result[k] = { opNonce: BigInt(v.opNonce), requestId: BigInt(v.requestId) };
  }
  return result;
}

export function useAuthSession(
  auctionAddress: string,
  missingKeys: UtilityKey[],
): AuthSession {
  const keysRef = useRef(missingKeys);
  keysRef.current = missingKeys;

  const [stored, setStored] = useState<StoredSession>(() => {
    if (missingKeys.length === 0) return { nonces: {}, sigs: {} };
    const existing = loadSession(auctionAddress, missingKeys);
    if (existing) return existing;
    const fresh = createFreshSession(missingKeys);
    saveSession(auctionAddress, fresh);
    return fresh;
  });

  const setSigs = useCallback((key: UtilityKey, value: ThreeSigs) => {
    setStored((prev) => {
      const next = { ...prev, sigs: { ...prev.sigs, [key]: value } };
      saveSession(auctionAddress, next);
      return next;
    });
  }, [auctionAddress]);

  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey(auctionAddress)); } catch { /* ignore */ }
    const fresh = createFreshSession(keysRef.current);
    saveSession(auctionAddress, fresh);
    setStored(fresh);
  }, [auctionAddress]);

  // Stable reference — only recomputes when the nonces strings actually change.
  const noncesJson = JSON.stringify(stored.nonces);
  const nonces = useMemo(() => toBigIntNonces(stored.nonces), [noncesJson]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    nonces,
    sigs:   stored.sigs as Record<string, ThreeSigs>,
    setSigs,
    clear,
  };
}
