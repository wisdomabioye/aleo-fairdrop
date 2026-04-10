import type { AbiRecord, AbiStruct } from '../runtime/abi';
import { plaintextToTsType } from './utils';

export function emitRecords(records: AbiRecord[], structs: AbiStruct[]): string {
  if (records.length === 0) return '';
  const lines: string[] = ['// ── Records ──────────────────────────────────────────────────────────────────', ''];

  // Collect struct names needed by records for the createRecordScanner structs arg
  const structNames = new Set(structs.map(s => s.path[s.path.length - 1]!));

  for (const r of records) {
    const name = r.path[r.path.length - 1]!;
    const scanFn   = `scan${name}Records`;
    const defConst = `_${name.charAt(0).toLowerCase() + name.slice(1)}RecordDef`;
    const scanConst = `_scan${name}`;

    // Determine which struct names are referenced by this record's fields
    const referencedStructs = r.fields
      .filter(f => 'Struct' in f.ty)
      .map(f => ('Struct' in f.ty ? f.ty.Struct.path[f.ty.Struct.path.length - 1]! : ''))
      .filter(n => structNames.has(n));

    // Interface
    lines.push(`export interface ${name}Record {`);
    for (const f of r.fields) {
      lines.push(`  ${f.name}: ${plaintextToTsType(f.ty)};`);
    }
    lines.push(`  spent:   boolean;`);
    lines.push(`  _record: string;  // plaintext — pass as transition input`);
    lines.push('}', '');

    // Inline AbiRecord definition
    lines.push(`const ${defConst}: AbiRecord = {`);
    lines.push(`  path: ${JSON.stringify(r.path)},`);
    lines.push(`  fields: [`);
    for (const f of r.fields) {
      lines.push(`    { name: ${JSON.stringify(f.name)}, ty: ${JSON.stringify(f.ty)} },`);
    }
    lines.push(`  ],`);
    lines.push(`};`);

    // Pass referenced structs so nested struct fields deserialize correctly
    const structsArg = referencedStructs.length > 0
      ? `[${referencedStructs.map(n => `_${n.charAt(0).toLowerCase() + n.slice(1)}RecordDef as unknown as AbiStruct`).join(', ')}]`
      : '[]';

    lines.push(`const ${scanConst} = createRecordScanner(${defConst}, ${structsArg});`);
    lines.push('');
    lines.push(`export function ${scanFn}(entries: WalletRecord[]): ${name}Record[] {`);
    lines.push(`  return ${scanConst}(entries) as ${name}Record[];`);
    lines.push('}', '');
  }

  return lines.join('\n');
}
