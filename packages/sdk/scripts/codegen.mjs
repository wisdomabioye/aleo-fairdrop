#!/usr/bin/env node
import { execSync }             from 'node:child_process';
import { globSync }             from 'node:fs';
import { resolve, dirname }     from 'node:path';
import { fileURLToPath }        from 'node:url';

const __dirname      = dirname(fileURLToPath(import.meta.url));
const abigen         = resolve(__dirname, '../../leo-abigen/dist/codegen.mjs');
const out            = resolve(__dirname, '../src/contracts');
const contractsRoot  = resolve(__dirname, '../../../contracts');

const abis = globSync('**/build/abi.json', { cwd: contractsRoot });

if (abis.length === 0) {
  console.error('[codegen] no abi.json files found — run `leo build` in each contract first');
  process.exit(1);
}

for (const rel of abis) {
  const abi = resolve(contractsRoot, rel);
  execSync(`node "${abigen}" --abi "${abi}" --out "${out}"`, { stdio: 'inherit' });
}
