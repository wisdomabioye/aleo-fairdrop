import type { MappingFetcher } from '@fairdrop/types/primitives';

// Duck-typed parameter — AleoNetworkClient is not importable without @provablehq/sdk as a dependency.
// Any object with getProgramMappingValue satisfies this.
type NetworkLike = {
  getProgramMappingValue(programId: string, mapping: string, key: string): Promise<string>;
};

export function fromAleoClient(client: NetworkLike): MappingFetcher {
  return {
    getMappingValue: async (programId, mapping, key) => {
      try {
        const v = await client.getProgramMappingValue(programId, mapping, key);
        return v ? String(v) : null;
      } catch {
        return null;
      }
    },
  };
}

export type { MappingFetcher };
