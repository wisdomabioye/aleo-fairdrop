import { useQuery }           from '@tanstack/react-query';
import { fetchProtocolTreasury } from '@fairdrop/sdk/chain';
import { config }               from '@/env';

export const AUCTION_PROGRAMS = [
  { label: 'Dutch',     programId: config.programs.dutch.programId     },
  { label: 'Sealed',    programId: config.programs.sealed.programId    },
  { label: 'Raise',     programId: config.programs.raise.programId     },
  { label: 'Ascending', programId: config.programs.ascending.programId },
  { label: 'LBP',       programId: config.programs.lbp.programId       },
  { label: 'Quadratic', programId: config.programs.quadratic.programId },
] as const;

export type TreasuryBalances = Record<string, bigint>;

export function useTreasuryBalances() {
  return useQuery({
    queryKey: ['treasury', 'balances'],
    queryFn:  async (): Promise<TreasuryBalances> => {
      const pairs = await Promise.all(
        AUCTION_PROGRAMS.map(async (p) => [p.programId, await fetchProtocolTreasury(p.programId)] as const),
      );
      return Object.fromEntries(pairs);
    },
    staleTime:       30_000,
    refetchInterval: 60_000,
  });
}
