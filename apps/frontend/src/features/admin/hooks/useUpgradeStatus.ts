import { useQuery }                    from '@tanstack/react-query';
import { fetchApprovedUpgradeChecksum } from '@fairdrop/sdk/chain';
import { UPGRADE_KEY }                  from '@fairdrop/sdk/multisig';

export interface ContractUpgradeEntry {
  name:      string;
  key:       string;
  checksum:  number[] | null;
}

const CONTRACT_LIST = (Object.entries(UPGRADE_KEY) as [string, string][]).map(
  ([name, key]) => ({ name, key }),
);

export function useUpgradeStatus() {
  return useQuery({
    queryKey: ['upgradeStatus'],
    queryFn:  async (): Promise<ContractUpgradeEntry[]> =>
      Promise.all(
        CONTRACT_LIST.map(async ({ name, key }) => ({
          name,
          key,
          checksum: await fetchApprovedUpgradeChecksum(key),
        })),
      ),
    staleTime: 60_000,
  });
}
