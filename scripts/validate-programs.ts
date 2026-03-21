/**
 * Validates that every program ID in contracts/deployments/programs.json
 * matches the corresponding contracts/*\/program.json on disk.
 *
 * Run: npx tsx scripts/validate-programs.ts
 * CI:  add to lint or pre-deploy pipeline.
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '..');

interface ProgramEntry {
  programId: string;
  contractPath: string;
  salt?: string;
}

interface ProgramsJson {
  programs: Record<string, ProgramEntry>;
}

interface ContractProgramJson {
  program: string;
}

const registry: ProgramsJson = JSON.parse(
  readFileSync(join(ROOT, 'contracts/deployments/programs.json'), 'utf8'),
);

let failed = false;

for (const [key, entry] of Object.entries(registry.programs)) {
  const contractFile = join(ROOT, entry.contractPath, 'program.json');
  let contractJson: ContractProgramJson;

  try {
    contractJson = JSON.parse(readFileSync(contractFile, 'utf8'));
  } catch {
    console.error(`[FAIL] ${key}: cannot read ${contractFile}`);
    failed = true;
    continue;
  }

  if (contractJson.program !== entry.programId) {
    console.error(
      `[FAIL] ${key}: programs.json says "${entry.programId}" but ${entry.contractPath}/program.json says "${contractJson.program}"`,
    );
    failed = true;
  } else {
    console.log(`[ OK ] ${key}: ${entry.programId}`);
  }
}

if (failed) {
  console.error('\nValidation failed — update contracts/deployments/programs.json to match.');
  process.exit(1);
} else {
  console.log('\nAll program IDs validated.');
}
