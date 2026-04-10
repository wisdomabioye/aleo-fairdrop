import type { MappingFetcher }        from '@fairdrop/types/primitives';
import type { AbiMapping, AbiStruct } from './abi';
import { deserializeOutput }          from './dispatch';

export function createMappingReader(
  fetcher:   MappingFetcher,
  programId: string,
  mapping:   AbiMapping,
  structs:   AbiStruct[],
): (key: string) => Promise<unknown> {
  return async (key: string) => {
    const raw = await fetcher.getMappingValue(programId, mapping.name, key);
    if (raw === null) return null;
    // mapping.value is AleoPlaintext — no Plaintext wrapper on mapping value types.
    return deserializeOutput(raw, mapping.value, structs);
  };
}
