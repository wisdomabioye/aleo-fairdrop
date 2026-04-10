import type { WalletRecord }         from '@fairdrop/types/primitives';
import type { AbiRecord, AbiStruct } from './abi';
import { deserializeOutput, parseStruct } from './dispatch';

export function createRecordScanner(
  record:  AbiRecord,
  structs: AbiStruct[],
): (entries: WalletRecord[]) => unknown[] {
  // ABI records use path: string[], not name: string.
  const recordName = record.path[record.path.length - 1]!;
  return (entries: WalletRecord[]) =>
    entries
      .filter(e => e.recordName === recordName)
      .map(e => {
        const fields = parseStruct(e.recordPlaintext);
        const result: Record<string, unknown> = {};
        for (const f of record.fields) {
          result[f.name] = deserializeOutput(fields[f.name] ?? '', f.ty, structs);
        }
        result['spent']   = e.spent;
        result['_record'] = e.recordPlaintext;
        return result;
      });
}
