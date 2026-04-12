import { useQuery } from '@tanstack/react-query';
import {
  fetchIsAllowedGateCaller,
  fetchIsAllowedRefCaller,
  fetchIsAllowedProofCaller,
  fetchIsAllowedVestCaller,
} from '@fairdrop/sdk/chain';
import { config } from '@/env';

export type UtilityKey = 'gate' | 'ref' | 'proof' | 'vest';

/** allowed_callers[auctionAddress] for every utility × auction combination. */
export type CallerStatusGrid = Record<UtilityKey, Record<string, boolean>>;

export const AUCTION_CALLERS = [
  { label: 'Dutch',     address: config.programs.dutch.programAddress     },
  { label: 'Sealed',    address: config.programs.sealed.programAddress    },
  { label: 'Raise',     address: config.programs.raise.programAddress     },
  { label: 'Ascending', address: config.programs.ascending.programAddress },
  { label: 'LBP',       address: config.programs.lbp.programAddress       },
  { label: 'Quadratic', address: config.programs.quadratic.programAddress },
].filter((e): e is { label: string; address: string } => !!e.address);

const UTILITY_FETCHERS: Record<UtilityKey, (address: string) => Promise<boolean>> = {
  gate:  fetchIsAllowedGateCaller,
  ref:   fetchIsAllowedRefCaller,
  proof: fetchIsAllowedProofCaller,
  vest:  fetchIsAllowedVestCaller,
};

const UTILITY_KEYS: UtilityKey[] = ['gate', 'ref', 'proof', 'vest'];

export const callerStatusQueryOptions = {
  queryKey: ['callerStatus'] as const,
  queryFn:  async (): Promise<CallerStatusGrid> => {
    const rows = await Promise.all(
      UTILITY_KEYS.map(async (key) => {
        const cells = await Promise.all(
          AUCTION_CALLERS.map(async (a) => [a.address, await UTILITY_FETCHERS[key](a.address)] as const),
        );
        return [key, Object.fromEntries(cells)] as const;
      }),
    );
    return Object.fromEntries(rows) as CallerStatusGrid;
  },
  staleTime: 30_000,
};

export function useCallerStatus() {
  return useQuery(callerStatusQueryOptions);
}
