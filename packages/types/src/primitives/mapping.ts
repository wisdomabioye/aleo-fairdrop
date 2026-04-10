/**
 * Minimal interface for reading Aleo on-chain mapping values.
 * Satisfied by AleoNetworkClient (via fromAleoClient adapter) or any fetch wrapper.
 */
export interface MappingFetcher {
  getMappingValue(
    programId: string,
    mapping:   string,
    key:       string,
  ): Promise<string | null>;
}
