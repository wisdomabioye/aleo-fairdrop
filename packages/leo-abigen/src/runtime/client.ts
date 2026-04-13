import type { TransactionOptions } from '@provablehq/aleo-types';
import type { MappingFetcher }     from '@fairdrop/types/primitives';
import type { Abi }                from './abi';
import { createMappingReader }     from './mapping';
import { createTransitionBuilder, type TxOptions } from './transition';
import { createRecordScanner }     from './records';

type ExecFn = (spec: TransactionOptions) => Promise<{ transactionId: string } | undefined>;

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export interface ClientConfig {
  fetchMapping?:       MappingFetcher;
  executeTransaction?: ExecFn;
  fee?:                number;
  privateFee?:         boolean;
}

export function createAbigen(abi: Abi, config: ClientConfig): Record<string, unknown> {
  const client: Record<string, unknown> = {};

  for (const fn of abi.functions) {
    client[toCamelCase(fn.name)] = createTransitionBuilder(abi.program, fn, abi.structs, {
      fee:                config.fee        ?? 300_000,
      privateFee:         config.privateFee ?? false,
      executeTransaction: config.executeTransaction,
    });
  }

  if (config.fetchMapping) {
    for (const mapping of abi.mappings) {
      client[toCamelCase(mapping.name)] = createMappingReader(
        config.fetchMapping, abi.program, mapping, abi.structs,
      );
    }
  }

  const records: Record<string, unknown> = {};
  for (const record of abi.records) {
    // AbiRecord has path: string[], not name: string.
    // PascalCase → camelCase + 's': LpToken → lpTokens
    const recordName  = record.path[record.path.length - 1]!;
    const scannerName = recordName.charAt(0).toLowerCase() + recordName.slice(1) + 's';
    records[scannerName] = createRecordScanner(record, abi.structs);
  }
  client['records'] = records;

  return client;
}

export type { TxOptions };
