import type { AbiStruct } from '../runtime/abi';
import { plaintextToTsType } from './utils';

export function emitStructs(structs: AbiStruct[]): string {
  if (structs.length === 0) return '';
  const lines: string[] = ['// ── Structs ──────────────────────────────────────────────────────────────────', ''];
  for (const s of structs) {
    const name = s.path[s.path.length - 1]!;
    lines.push(`export interface ${name} {`);
    for (const f of s.fields) {
      lines.push(`  ${f.name}: ${plaintextToTsType(f.ty)};`);
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}
