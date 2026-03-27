/**
 * Validates that every env var declared in each service's .env.example
 * is covered by infra/docker/.env.example, and vice versa.
 *
 * Run:  pnpm validate:envs
 * CI:   add to pre-deploy or lint pipeline.
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseKeys(filePath: string): Set<string> {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const keys = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    keys.add(line.slice(0, eq).trim());
  }
  return keys;
}

// ── Sources ───────────────────────────────────────────────────────────────────

const sources: Array<{ label: string; path: string }> = [
  { label: 'services/api',     path: join(ROOT, 'services/api/.env.example') },
  { label: 'services/indexer', path: join(ROOT, 'services/indexer/.env.example') },
];

const combinedPath = join(ROOT, 'infra/docker/.env.example');
const combinedLabel = 'infra/docker';

// ── Parse ─────────────────────────────────────────────────────────────────────

const combined = parseKeys(combinedPath);
const serviceKeys = new Map<string, Set<string>>();

for (const { label, path } of sources) {
  serviceKeys.set(label, parseKeys(path));
}

// ── Validate ──────────────────────────────────────────────────────────────────

let failed = false;

// 1. Every service key must exist in the combined file.
for (const [label, keys] of serviceKeys) {
  for (const key of keys) {
    if (!combined.has(key)) {
      console.error(`[FAIL] ${key}  —  in ${label}/.env.example but missing from ${combinedLabel}/.env.example`);
      failed = true;
    }
  }
}

// 2. Every combined key must exist in at least one service file.
const allServiceKeys = new Set([...serviceKeys.values()].flatMap(s => [...s]));
for (const key of combined) {
  if (!allServiceKeys.has(key)) {
    console.error(`[FAIL] ${key}  —  in ${combinedLabel}/.env.example but missing from all service .env.example files`);
    failed = true;
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

if (failed) {
  console.error('\nEnv validation failed — keep service and combined .env.example files in sync.');
  process.exit(1);
} else {
  const total = combined.size;
  console.log(`All ${total} env vars are in sync across service and combined .env.example files.`);
}
