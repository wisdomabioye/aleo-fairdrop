import { readFile } from 'node:fs/promises';
import type { CheckFn } from './types.js';

async function loadFromFile(path: string): Promise<string[]> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as string[];
}

async function loadFromUrl(url: string): Promise<string[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[allowlist] fetch failed with status ${res.status}`);
  return res.json() as Promise<string[]>;
}

async function loadAddresses(source: string): Promise<Set<string>> {
  if (source.startsWith('file://')) {
    const addresses = await loadFromFile(source.slice('file://'.length));
    return new Set(addresses);
  }
  if (source.startsWith('https://') || source.startsWith('http://')) {
    const addresses = await loadFromUrl(source);
    return new Set(addresses);
  }
  throw new Error('[allowlist] ALLOWLIST_SOURCE must start with file:// or https://');
}

export async function buildAllowlistCheck(source: string): Promise<CheckFn> {
  const addresses = await loadAddresses(source);
  console.log(`[allowlist] loaded ${addresses.size} addresses`);
  return (address) => Promise.resolve(addresses.has(address));
}
